import type { NexusDocument, ResourceRef } from "../model/types";
import type { Selection } from "../selection/selection";
import { findParagraphLike, getPlainText } from "../model/tree";
import type { Command } from "../commands/types";
import { applyTransaction } from "../transactions/transaction";
import { HistoryManager, type HistoryGroup, type HistoryOptions } from "../history/history";
import { TypedEmitter } from "../events/emitter";
import { createIdGenerator, type IdGenerator } from "../core/ids";
import { systemClock, type Clock } from "../core/clock";
import { DEFAULT_LIMITS, type EngineLimits } from "../schema/schema";
import { validateDocument, collectValidationIssues, type ValidationIssue } from "../validation/validate";
import { normalizeDocument } from "../normalization/normalize";
import { writeNsx } from "../nsx/writer";
import { readNsx } from "../nsx/reader";
import { addResource, removeResource, type AddResourceInput } from "../resources/resources";
import { createDocument as createDocumentInternal, type CreateDocumentOptions } from "../commands/document";
import { EngineError, engineError } from "../errors/errors";
import { err, ok, type Result } from "../utils/result";
import { deepFreeze } from "../utils/freeze";

export interface EditorEvents {
  documentChanged: { document: NexusDocument };
  transactionRejected: { error: EngineError };
  selectionChanged: { selection: Selection | undefined };
  historyChanged: { canUndo: boolean; canRedo: boolean };
  documentOpened: { document: NexusDocument };
  documentSaved: { text: string };
  resourceAdded: { resource: ResourceRef };
  resourceRemoved: { resourceId: string };
  error: { error: EngineError };
  [key: string]: unknown;
}

export interface EditorOptions {
  document?: NexusDocument;
  idGenerator?: IdGenerator;
  clock?: Clock;
  limits?: EngineLimits;
  historyOptions?: HistoryOptions;
  /**
   * Called when an event listener throws. Listener failures never roll back a
   * committed transaction. The core has no ambient logger (no `console`), so
   * hosts decide how to report these. Defaults to ignoring them.
   */
  onListenerError?: (error: unknown, event: string) => void;
}

export interface ExecOptions {
  group?: HistoryGroup;
}

/**
 * The engine's main public surface: a stateful editing session wrapping a
 * single document. See docs/ENGINE_API.md for the full contract.
 */
export class Editor {
  private document: NexusDocument;
  private selection: Selection | undefined;
  private readonly history: HistoryManager;
  private readonly emitter = new TypedEmitter<EditorEvents>();
  private readonly generateId: IdGenerator;
  private readonly clock: Clock;
  private readonly limits: EngineLimits;
  private disposed = false;

  constructor(options: EditorOptions = {}) {
    this.generateId = options.idGenerator ?? createIdGenerator("n");
    this.clock = options.clock ?? systemClock;
    this.limits = options.limits ?? DEFAULT_LIMITS;
    this.history = new HistoryManager(this.clock, options.historyOptions);
    this.document = deepFreeze(options.document ?? createDocumentInternal(this.generateId, this.clock));
    const report = options.onListenerError;
    this.emitter.onListenerError = (error, event) => {
      // A broken listener must never crash the engine or roll back a committed transaction.
      try {
        report?.(error, String(event));
      } catch {
        // The error reporter itself failed; nothing sensible left to do.
      }
    };
  }

  getDocument(): NexusDocument {
    return this.document;
  }

  getSelection(): Selection | undefined {
    return this.selection;
  }

  setSelection(selection: Selection | undefined): Result<void> {
    this.assertNotDisposed();
    if (selection) {
      for (const point of [selection.anchor, selection.focus]) {
        const node = findParagraphLike(this.document.content, point.blockId);
        if (!node) return err(engineError("NODE_NOT_FOUND", `Selection references unknown block "${point.blockId}"`));
        const length = getPlainText(node).length;
        if (point.offset < 0 || point.offset > length) {
          return err(engineError("INVALID_POSITION", `Selection offset ${point.offset} out of range [0, ${length}]`));
        }
      }
    }
    this.selection = selection;
    this.emitter.emit("selectionChanged", { selection });
    return ok(undefined);
  }

  /** Applies one or more commands as a single atomic transaction. */
  exec(commands: Command[], options: ExecOptions = {}): Result<{ document: NexusDocument; selection?: Selection }> {
    this.assertNotDisposed();
    const before = this.document;
    const selectionBefore = this.selection;
    const result = applyTransaction(before, commands, { generateId: this.generateId }, this.limits);
    if (!result.ok) {
      this.emitter.emit("transactionRejected", { error: result.error });
      this.emitter.emit("error", { error: result.error });
      return err(result.error);
    }
    const after = deepFreeze(result.value.document);
    this.document = after;
    const selectionAfter: Selection | undefined = result.value.selection
      ? { anchor: result.value.selection, focus: result.value.selection }
      : selectionBefore;
    this.selection = selectionAfter;
    this.history.push({ before, after, selectionBefore, selectionAfter, group: options.group ?? "structural" });
    this.emitter.emit("documentChanged", { document: after });
    this.emitter.emit("selectionChanged", { selection: selectionAfter });
    this.emitter.emit("historyChanged", { canUndo: this.history.canUndo(), canRedo: this.history.canRedo() });
    return ok({ document: after, selection: selectionAfter });
  }

  undo(): boolean {
    this.assertNotDisposed();
    const entry = this.history.undo();
    if (!entry) return false;
    this.document = entry.document;
    this.selection = entry.selection;
    this.emitter.emit("documentChanged", { document: this.document });
    this.emitter.emit("selectionChanged", { selection: this.selection });
    this.emitter.emit("historyChanged", { canUndo: this.history.canUndo(), canRedo: this.history.canRedo() });
    return true;
  }

  redo(): boolean {
    this.assertNotDisposed();
    const entry = this.history.redo();
    if (!entry) return false;
    this.document = entry.document;
    this.selection = entry.selection;
    this.emitter.emit("documentChanged", { document: this.document });
    this.emitter.emit("selectionChanged", { selection: this.selection });
    this.emitter.emit("historyChanged", { canUndo: this.history.canUndo(), canRedo: this.history.canRedo() });
    return true;
  }

  canUndo(): boolean {
    return this.history.canUndo();
  }

  canRedo(): boolean {
    return this.history.canRedo();
  }

  /** Number of undo/redo steps currently retained (read-only diagnostics). */
  getHistoryInfo(): { undo: number; redo: number } {
    return this.history.size;
  }

  validate(): Result<NexusDocument> {
    return validateDocument(this.document, this.limits);
  }

  getValidationIssues(): ValidationIssue[] {
    return collectValidationIssues(this.document, this.limits);
  }

  /** Normalizes the current document and records the change in history (group: "structural"). */
  normalize(): NexusDocument {
    this.assertNotDisposed();
    const before = this.document;
    const candidate = deepFreeze(normalizeDocument(before, this.generateId));
    // normalizeDocument returns a defensive clone; compare values so a no-op
    // normalization does not create a phantom history entry on every save.
    if (JSON.stringify(candidate) !== JSON.stringify(before)) {
      this.document = candidate;
      this.history.push({ before, after: candidate, selectionBefore: this.selection, selectionAfter: this.selection, group: "structural" });
      this.emitter.emit("documentChanged", { document: candidate });
      this.emitter.emit("historyChanged", { canUndo: this.history.canUndo(), canRedo: this.history.canRedo() });
    }
    return this.document;
  }

  serialize(): Result<string> {
    return writeNsx(this.document, this.limits);
  }

  save(): Result<string> {
    const result = this.serialize();
    if (result.ok) this.emitter.emit("documentSaved", { text: result.value });
    else this.emitter.emit("error", { error: result.error });
    return result;
  }

  /** Opens a `.nsx` payload, replacing the current document and history only if parsing succeeds. */
  open(text: string): Result<NexusDocument> {
    this.assertNotDisposed();
    const result = readNsx(text, this.generateId, this.limits);
    if (!result.ok) {
      this.emitter.emit("error", { error: result.error });
      return result;
    }
    this.document = deepFreeze(result.value);
    this.selection = undefined;
    this.history.clear();
    this.emitter.emit("documentOpened", { document: this.document });
    this.emitter.emit("documentChanged", { document: this.document });
    this.emitter.emit("historyChanged", { canUndo: false, canRedo: false });
    return ok(this.document);
  }

  /** Replaces the current document outright (e.g. loading a fixture or importer output). History is reset. */
  load(document: NexusDocument): Result<NexusDocument> {
    this.assertNotDisposed();
    const validation = validateDocument(document, this.limits);
    if (!validation.ok) return validation;
    this.document = deepFreeze(document);
    this.selection = undefined;
    this.history.clear();
    this.emitter.emit("documentOpened", { document: this.document });
    this.emitter.emit("documentChanged", { document: this.document });
    this.emitter.emit("historyChanged", { canUndo: false, canRedo: false });
    return ok(this.document);
  }

  addResource(input: AddResourceInput): Result<ResourceRef> {
    this.assertNotDisposed();
    const result = addResource(this.document, input, this.generateId, this.limits);
    if (!result.ok) {
      this.emitter.emit("error", { error: result.error });
      return result;
    }
    const before = this.document;
    this.document = deepFreeze(result.value.document);
    this.history.push({ before, after: this.document, selectionBefore: this.selection, selectionAfter: this.selection, group: "structural" });
    this.emitter.emit("resourceAdded", { resource: result.value.resource });
    this.emitter.emit("documentChanged", { document: this.document });
    return ok(result.value.resource);
  }

  removeResource(resourceId: string, options: { force?: boolean } = {}): Result<void> {
    this.assertNotDisposed();
    const result = removeResource(this.document, resourceId, options);
    if (!result.ok) {
      this.emitter.emit("error", { error: result.error });
      return result;
    }
    const before = this.document;
    this.document = deepFreeze(result.value);
    this.history.push({ before, after: this.document, selectionBefore: this.selection, selectionAfter: this.selection, group: "structural" });
    this.emitter.emit("resourceRemoved", { resourceId });
    this.emitter.emit("documentChanged", { document: this.document });
    return ok(undefined);
  }

  on<K extends keyof EditorEvents>(event: K, listener: (payload: EditorEvents[K]) => void): () => void {
    return this.emitter.on(event, listener);
  }

  off<K extends keyof EditorEvents>(event: K, listener: (payload: EditorEvents[K]) => void): void {
    this.emitter.off(event, listener);
  }

  dispose(): void {
    this.history.dispose();
    this.emitter.removeAllListeners();
    this.disposed = true;
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  private assertNotDisposed(): void {
    if (this.disposed) throw new Error("Cannot use an Editor instance after dispose() has been called");
  }
}

export function createEditor(options: EditorOptions = {}): Editor {
  return new Editor(options);
}

export function createDocument(options: CreateDocumentOptions = {}, idGenerator: IdGenerator = createIdGenerator("n"), clock: Clock = systemClock): NexusDocument {
  return createDocumentInternal(idGenerator, clock, options);
}

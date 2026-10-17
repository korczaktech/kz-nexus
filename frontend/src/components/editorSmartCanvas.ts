import type { Block, Selection, createEditor } from "../../../packages/engine/src/index";
import { getEngineLogicalContext } from "../services/nexusEngineAdapter";
import { isCompositionInput } from "./editorComposition";

type EngineInstance = ReturnType<typeof createEditor>;

export type SmartCanvasSelectionContext = NonNullable<ReturnType<typeof getEngineLogicalContext>>;

/**
 * Returns editable text blocks in document order, including blocks nested in
 * table rows/cells. Search and structural selection must not silently skip a
 * table merely because it is a container rather than a text block.
 */
export function collectSmartCanvasTextBlocks(content: readonly unknown[]): Array<Extract<Block, { type: "paragraph" | "heading" }>> {
  const blocks: Array<Extract<Block, { type: "paragraph" | "heading" }>> = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const value = node as { type?: string; id?: string; children?: unknown[] };
    if ((value.type === "paragraph" || value.type === "heading") && typeof value.id === "string" && Array.isArray(value.children)) {
      blocks.push(value as Extract<Block, { type: "paragraph" | "heading" }>);
      return;
    }
    for (const child of value.children ?? []) visit(child);
  };
  content.forEach(visit);
  return blocks;
}



export type SmartCanvasTextSelectionRange = {
  block: Extract<Block, { type: "paragraph" | "heading" }>;
  start: number;
  end: number;
};

/**
 * Maps a logical selection to text ranges in document order. It deliberately
 * preserves container boundaries: callers can edit each selected text block
 * without deleting or flattening the list/table/blockquote that owns it.
 */
export function getSmartCanvasTextSelectionRanges(
  content: readonly unknown[],
  selection: Selection,
): SmartCanvasTextSelectionRange[] | null {
  const blocks = collectSmartCanvasTextBlocks(content);
  const anchorIndex = blocks.findIndex(block => block.id === selection.anchor.blockId);
  const focusIndex = blocks.findIndex(block => block.id === selection.focus.blockId);
  if (anchorIndex < 0 || focusIndex < 0) return null;
  const forward = anchorIndex <= focusIndex;
  const firstIndex = Math.min(anchorIndex, focusIndex);
  const lastIndex = Math.max(anchorIndex, focusIndex);
  const firstOffset = anchorIndex === focusIndex
    ? Math.min(selection.anchor.offset, selection.focus.offset)
    : forward ? selection.anchor.offset : selection.focus.offset;
  const lastOffset = anchorIndex === focusIndex
    ? Math.max(selection.anchor.offset, selection.focus.offset)
    : forward ? selection.focus.offset : selection.anchor.offset;
  const selected = blocks.slice(firstIndex, lastIndex + 1);
  const ranges = selected.map((block, index) => ({
    block,
    start: index === 0 ? firstOffset : 0,
    end: index === selected.length - 1 ? lastOffset : block.children.reduce((length, run) => length + run.text.length, 0),
  }));
  if (ranges.some(range => !Number.isInteger(range.start) || !Number.isInteger(range.end) ||
      range.start < 0 || range.end < range.start ||
      range.end > range.block.children.reduce((length, run) => length + run.text.length, 0))) return null;
  return ranges;
}

export type SmartCanvasTextMatch = { blockId: string; start: number; end: number };

/** Finds case-insensitive matches in document order, including text nested in tables and lists. */
export function findSmartCanvasTextMatches(content: readonly unknown[], term: string): SmartCanvasTextMatch[] {
  if (!term) return [];
  const needle = term.toLocaleLowerCase();
  const matches: SmartCanvasTextMatch[] = [];
  for (const block of collectSmartCanvasTextBlocks(content)) {
    const text = block.children.map(run => run.text).join("");
    let folded = "";
    const sourceStarts: number[] = [];
    const sourceEnds: number[] = [];
    for (let offset = 0; offset < text.length;) {
      const codePoint = String.fromCodePoint(text.codePointAt(offset)!);
      const lower = codePoint.toLocaleLowerCase();
      for (let index = 0; index < lower.length; index += 1) {
        folded += lower[index];
        sourceStarts.push(offset);
        sourceEnds.push(offset + codePoint.length);
      }
      offset += codePoint.length;
    }
    let from = 0;
    while (true) {
      const at = folded.indexOf(needle, from);
      if (at < 0) break;
      const start = sourceStarts[at];
      const end = sourceEnds[at + needle.length - 1];
      if (start !== undefined && end !== undefined) matches.push({ blockId: block.id, start, end });
      from = at + Math.max(1, needle.length);
    }
  }
  return matches;
}

export type SmartCanvasDiagnostics = {
  reads: number;
  successfulReads: number;
  failedReads: number;
  restores: number;
  beforeInputEvents: number;
  compositionDeferredEvents: number;
};

const diagnostics: SmartCanvasDiagnostics = {
  reads: 0,
  successfulReads: 0,
  failedReads: 0,
  restores: 0,
  beforeInputEvents: 0,
  compositionDeferredEvents: 0,
};

/**
 * Opt-in integration gate for the production editor.
 * Enable with ?smartCanvas=1. It deliberately defaults off until the full
 * keyboard/IME/clipboard/pagination regression suite is complete.
 */
export function isProductionSmartCanvasEnabled(search?: string): boolean {
  const query = search ?? (typeof window !== "undefined" ? window.location.search : "");
  return new URLSearchParams(query).get("smartCanvas") === "1";
}

/**
 * Reads the current logical selection from the canonical Nexus engine.
 * This path does not inspect window.getSelection(), DOM Range, or a legacy
 * editor root; SmartCanvas selection is already represented by block IDs and
 * UTF-16 offsets in the engine session.
 */
export function readSmartCanvasSelection(
  engine: EngineInstance,
): SmartCanvasSelectionContext | null {
  diagnostics.reads += 1;
  const context = getEngineLogicalContext(engine);
  if (context) diagnostics.successfulReads += 1;
  else diagnostics.failedReads += 1;
  return context;
}

export function restoreSmartCanvasSelection(_engine: EngineInstance, root: HTMLElement): void {
  diagnostics.restores += 1;
  // Focus the SmartCanvas input surface only. Never restore a browser Range
  // into the hidden legacy contentEditable projection.
  // Scope focus to this editor instance. A document-wide query can focus a
  // different SmartCanvas when multiple editors/previews are mounted.
  const input = root.querySelector<HTMLTextAreaElement>('textarea[aria-label="Entrada de texto do SmartCanvas"]');
  input?.focus({ preventScroll: true });
}


export type SmartCanvasBeforeInputEvent = {
  nativeEvent: Event;
  preventDefault: () => void;
};

/**
 * Explicit production input seam. The current command handler remains the
 * authority for translating beforeinput into Nexus commands; this adapter
 * records dispatch and IME deferrals without mutating browser input itself.
 */
export function dispatchSmartCanvasBeforeInput(
  event: SmartCanvasBeforeInputEvent,
  handler: (event: SmartCanvasBeforeInputEvent) => void,
  compositionActive: boolean,
): void {
  const inputEvent = event.nativeEvent as InputEvent;
  diagnostics.beforeInputEvents += 1;
  if (isCompositionInput(compositionActive, inputEvent.inputType || "", inputEvent.isComposing)) {
    diagnostics.compositionDeferredEvents += 1;
  }
  handler(event);
}

export function getSmartCanvasDiagnostics(): Readonly<SmartCanvasDiagnostics> {
  return { ...diagnostics };
}

/** Test-only reset to keep instrumentation isolated between cases. */
export function resetSmartCanvasDiagnostics(): void {
  diagnostics.reads = 0;
  diagnostics.successfulReads = 0;
  diagnostics.failedReads = 0;
  diagnostics.restores = 0;
  diagnostics.beforeInputEvents = 0;
  diagnostics.compositionDeferredEvents = 0;
}

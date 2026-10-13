import type { NexusDocument } from "../model/types";
import type { Selection } from "../selection/selection";
import type { Clock } from "../core/clock";

export type HistoryGroup = "typing" | "formatting" | "structural" | "external";

interface HistoryEntry {
  before: NexusDocument;
  after: NexusDocument;
  selectionBefore?: Selection;
  selectionAfter?: Selection;
  group: HistoryGroup;
  timestamp: number;
}

export interface HistoryOptions {
  maxEntries?: number;
  /** Consecutive same-group edits within this window (ms) are merged into one undo step. */
  typingGroupWindowMs?: number;
}

const TYPING_GROUPABLE: ReadonlySet<HistoryGroup> = new Set(["typing"]);

/**
 * Own undo/redo implementation (Section 8). Uses a snapshot strategy: each
 * entry stores the before/after document. This is simple to reason about and
 * test; documents are plain JSON objects so snapshots share structure via
 * the JS engine's string/array interning where possible. See docs/HISTORY.md
 * for the cost analysis and future optimization path (patches).
 */
export class HistoryManager {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private readonly maxEntries: number;
  private readonly typingGroupWindowMs: number;
  private readonly now: Clock;

  constructor(now: Clock, options: HistoryOptions = {}) {
    this.now = now;
    this.maxEntries = options.maxEntries ?? 200;
    this.typingGroupWindowMs = options.typingGroupWindowMs ?? 800;
  }

  push(entry: { before: NexusDocument; after: NexusDocument; selectionBefore?: Selection; selectionAfter?: Selection; group: HistoryGroup }): void {
    const timestamp = this.now();
    const last = this.undoStack[this.undoStack.length - 1];
    const canMerge =
      last &&
      TYPING_GROUPABLE.has(entry.group) &&
      last.group === entry.group &&
      timestamp - last.timestamp <= this.typingGroupWindowMs;

    if (canMerge) {
      last.after = entry.after;
      last.selectionAfter = entry.selectionAfter;
      last.timestamp = timestamp;
    } else {
      this.undoStack.push({ ...entry, timestamp });
      if (this.undoStack.length > this.maxEntries) this.undoStack.shift();
    }
    this.redoStack = [];
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): { document: NexusDocument; selection?: Selection } | undefined {
    const entry = this.undoStack.pop();
    if (!entry) return undefined;
    this.redoStack.push(entry);
    return { document: entry.before, selection: entry.selectionBefore };
  }

  redo(): { document: NexusDocument; selection?: Selection } | undefined {
    const entry = this.redoStack.pop();
    if (!entry) return undefined;
    this.undoStack.push(entry);
    return { document: entry.after, selection: entry.selectionAfter };
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  get size(): { undo: number; redo: number } {
    return { undo: this.undoStack.length, redo: this.redoStack.length };
  }

  dispose(): void {
    this.clear();
  }
}

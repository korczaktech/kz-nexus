/**
 * Logical selection model, independent from the DOM (Section 7).
 *
 * A `Position` addresses a character offset inside the flattened text of a
 * single block (paragraph, heading, or table cell paragraph). Block-level
 * (structural) selection is intentionally out of scope for this version and
 * documented as a limitation in docs/SELECTION.md.
 */
export interface Position {
  blockId: string;
  offset: number;
}

export interface Selection {
  anchor: Position;
  focus: Position;
}

export function isCollapsed(selection: Selection): boolean {
  return selection.anchor.blockId === selection.focus.blockId && selection.anchor.offset === selection.focus.offset;
}

export function collapsedAt(position: Position): Selection {
  return { anchor: position, focus: position };
}

/** Normalizes a selection so `start` always precedes `end` for same-block ranges. */
export function orderedRange(selection: Selection): { start: Position; end: Position } {
  if (selection.anchor.blockId === selection.focus.blockId) {
    return selection.anchor.offset <= selection.focus.offset
      ? { start: selection.anchor, end: selection.focus }
      : { start: selection.focus, end: selection.anchor };
  }
  return { start: selection.anchor, end: selection.focus };
}

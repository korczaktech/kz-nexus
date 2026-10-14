/** Selection helpers shared by the visual editor and its Kortex command bridge. */
export type TextRange = { start: number; end: number };
export type WordDirection = 'backward' | 'forward';

/** Normalizes browser selection endpoints while preserving UTF-16 DOM offsets. */
export function normalizeTextRange(anchor: number, focus: number): TextRange {
  const safeAnchor = Number.isFinite(anchor) ? Math.max(0, Math.trunc(anchor)) : 0;
  const safeFocus = Number.isFinite(focus) ? Math.max(0, Math.trunc(focus)) : 0;
  return { start: Math.min(safeAnchor, safeFocus), end: Math.max(safeAnchor, safeFocus) };
}

/**
 * Calculates a Ctrl/Option+Backspace/Delete word range without changing text.
 * DOM and JavaScript string offsets are both UTF-16 code-unit offsets.
 */
export function wordDeletionRange(text: string, offset: number, direction: WordDirection): TextRange {
  const cursor = Math.max(0, Math.min(text.length, Number.isFinite(offset) ? Math.trunc(offset) : 0));
  let start = cursor;
  let end = cursor;
  if (direction === 'backward') {
    while (start > 0 && /\s/.test(text[start - 1]!)) start--;
    while (start > 0 && !/\s/.test(text[start - 1]!)) start--;
  } else {
    while (end < text.length && /\s/.test(text[end]!)) end++;
    while (end < text.length && !/\s/.test(text[end]!)) end++;
  }
  return { start, end };
}

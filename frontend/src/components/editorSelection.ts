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
/**
 * Returns the complete grapheme under the caret, so deletion does not split
 * combining marks, emoji modifiers, flags, or zero-width-joiner emoji.
 * Uses Intl.Segmenter where available and keeps a surrogate-safe fallback.
 */
export function characterDeletionRange(text: string, offset: number, direction: WordDirection): TextRange {
  const cursor = Math.max(0, Math.min(text.length, Number.isFinite(offset) ? Math.trunc(offset) : 0));
  if (direction === 'backward' && cursor === 0) return { start: 0, end: 0 };
  if (direction === 'forward' && cursor === text.length) return { start: cursor, end: cursor };

  type GraphemeSegment = { index: number; segment: string };
  type SegmenterLike = { segment(input: string): Iterable<GraphemeSegment> };
  const Segmenter = (Intl as unknown as {
    Segmenter?: new (locale?: string, options?: { granularity: 'grapheme' }) => SegmenterLike;
  }).Segmenter;

  if (Segmenter) {
    const segments = Array.from(new Segmenter(undefined, { granularity: 'grapheme' }).segment(text));
    if (direction === 'backward') {
      const target = [...segments].reverse().find(item => item.index < cursor && item.index + item.segment.length >= cursor);
      if (target) return { start: target.index, end: target.index + target.segment.length };
    } else {
      const target = segments.find(item => item.index <= cursor && item.index + item.segment.length > cursor);
      if (target) return { start: target.index, end: target.index + target.segment.length };
    }
  }

  // Older runtimes: preserve at least complete surrogate pairs.
  if (direction === 'backward') {
    let start = cursor - 1;
    const last = text.charCodeAt(cursor - 1);
    const previous = cursor > 1 ? text.charCodeAt(cursor - 2) : 0;
    if (last >= 56320 && last <= 57343 && previous >= 55296 && previous <= 56319) start--;
    return { start, end: cursor };
  }
  let end = cursor + 1;
  const first = text.charCodeAt(cursor);
  const next = cursor + 1 < text.length ? text.charCodeAt(cursor + 1) : 0;
  if (first >= 55296 && first <= 56319 && next >= 56320 && next <= 57343) end++;
  return { start: cursor, end };
}

export function wordDeletionRange(text: string, offset: number, direction: WordDirection): TextRange {
  const cursor = Math.max(0, Math.min(text.length, Number.isFinite(offset) ? Math.trunc(offset) : 0));
  let start = cursor;
  let end = cursor;
  if (direction === 'backward') {
    while (start > 0 && /\\s/.test(text[start - 1]!)) start--;
    while (start > 0 && !/\\s/.test(text[start - 1]!)) start--;
  } else {
    while (end < text.length && /\\s/.test(text[end]!)) end++;
    while (end < text.length && !/\\s/.test(text[end]!)) end++;
  }
  return { start, end };
}

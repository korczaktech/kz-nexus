/**
 * UTF-16 offsets remain compatible with String.slice. Prefer grapheme boundaries
 * (so combined emoji and base+combining-mark sequences move as one unit); fall
 * back to code-point boundaries on runtimes without Intl.Segmenter.
 */
type GraphemeSegment = { index: number; segment: string };
type GraphemeSegmenter = { segment(input: string): Iterable<GraphemeSegment> };
type SegmenterConstructor = new (
  locales?: string | string[],
  options?: { granularity: "grapheme" },
) => GraphemeSegmenter;

function graphemeBoundaries(text: string): number[] | undefined {
  const Segmenter = (Intl as unknown as { Segmenter?: SegmenterConstructor }).Segmenter;
  if (!Segmenter) return undefined;
  const boundaries = Array.from(new Segmenter(undefined, { granularity: "grapheme" }).segment(text), part => part.index);
  boundaries.push(text.length);
  return boundaries;
}

export function previousCodePointOffset(text: string, offset: number): number {
  const bounded = Math.max(0, Math.min(text.length, offset));
  if (bounded <= 0) return 0;
  const boundaries = graphemeBoundaries(text);
  if (boundaries) {
    const previous = boundaries.filter(index => index < bounded).at(-1);
    return previous ?? 0;
  }
  const previous = text.charCodeAt(bounded - 1);
  if (previous >= 0xdc00 && previous <= 0xdfff && bounded >= 2) {
    const lead = text.charCodeAt(bounded - 2);
    if (lead >= 0xd800 && lead <= 0xdbff) return bounded - 2;
  }
  return bounded - 1;
}

export function nextCodePointOffset(text: string, offset: number): number {
  const bounded = Math.max(0, Math.min(text.length, offset));
  if (bounded >= text.length) return text.length;
  const boundaries = graphemeBoundaries(text);
  if (boundaries) return boundaries.find(index => index > bounded) ?? text.length;
  const current = text.charCodeAt(bounded);
  if (current >= 0xd800 && current <= 0xdbff && bounded + 1 < text.length) {
    const trail = text.charCodeAt(bounded + 1);
    if (trail >= 0xdc00 && trail <= 0xdfff) return bounded + 2;
  }
  return bounded + 1;
}


/** Returns the previous word boundary, skipping whitespace and then the word. */
export function previousWordOffset(text: string, offset: number): number {
  let cursor = Math.max(0, Math.min(text.length, offset));
  while (cursor > 0) {
    const previous = previousCodePointOffset(text, cursor);
    if (!/\s/u.test(text.slice(previous, cursor))) break;
    cursor = previous;
  }
  while (cursor > 0) {
    const previous = previousCodePointOffset(text, cursor);
    if (/\s/u.test(text.slice(previous, cursor))) break;
    cursor = previous;
  }
  return cursor;
}

/** Returns the next word boundary, skipping the current word and following whitespace. */
export function nextWordOffset(text: string, offset: number): number {
  let cursor = Math.max(0, Math.min(text.length, offset));
  while (cursor < text.length) {
    const next = nextCodePointOffset(text, cursor);
    if (/\s/u.test(text.slice(cursor, next))) break;
    cursor = next;
  }
  while (cursor < text.length) {
    const next = nextCodePointOffset(text, cursor);
    if (!/\s/u.test(text.slice(cursor, next))) break;
    cursor = next;
  }
  return cursor;
}

/** Finds a word-like range around an offset, treating punctuation as selectable tokens. */
export function wordRangeAt(text: string, offset: number): { start: number; end: number } {
  const bounded = Math.max(0, Math.min(text.length, offset));
  if (text.length === 0) return { start: 0, end: 0 };
  let probe = bounded === text.length && bounded > 0 ? previousCodePointOffset(text, bounded) : bounded;
  if (probe < text.length && /\s/u.test(text.slice(probe, nextCodePointOffset(text, probe)))) {
    const next = nextCodePointOffset(text, probe);
    const previous = probe > 0 ? previousCodePointOffset(text, probe) : probe;
    if (probe > 0 && !/\s/u.test(text.slice(previous, probe))) probe = previous;
    else if (next < text.length && !/\s/u.test(text.slice(next, nextCodePointOffset(text, next)))) probe = next;
  }
  let start = probe;
  let end = probe;
  while (start > 0) {
    const previous = previousCodePointOffset(text, start);
    if (/\s/u.test(text.slice(previous, start))) break;
    start = previous;
  }
  while (end < text.length) {
    const next = nextCodePointOffset(text, end);
    if (/\s/u.test(text.slice(end, next))) break;
    end = next;
  }
  return { start, end };
}


/** Snaps a UTF-16 offset to the nearest grapheme boundary. */
export function nearestGraphemeOffset(text: string, offset: number): number {
  const bounded = Math.max(0, Math.min(text.length, offset));
  const previous = previousCodePointOffset(text, bounded);
  if (nextCodePointOffset(text, previous) === bounded) return bounded;
  const next = nextCodePointOffset(text, bounded);
  return bounded - previous <= next - bounded ? previous : next;
}

/** Returns the UTF-16 offset at the beginning of the visual line containing an offset in newline-separated text. */
export function lineStartOffset(text: string, offset: number): number {
  const bounded = Math.max(0, Math.min(text.length, offset));
  return text.lastIndexOf("\n", Math.max(0, bounded - 1)) + 1;
}

/** Returns the UTF-16 offset at the end of the line, excluding its newline. */
export function lineEndOffset(text: string, offset: number): number {
  const bounded = Math.max(0, Math.min(text.length, offset));
  const newline = text.indexOf("\n", bounded);
  return newline < 0 ? text.length : newline;
}

/** Moves vertically between newline-separated lines while preserving the desired character column. */
export function verticalLineOffset(text: string, offset: number, direction: -1 | 1, preferredColumn?: number): number {
  const bounded = Math.max(0, Math.min(text.length, offset));
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") starts.push(index + 1);
  }
  let currentLine = starts.findLastIndex(start => start <= bounded);
  if (currentLine < 0) currentLine = 0;
  const currentStart = starts[currentLine] ?? 0;
  const currentEnd = currentLine + 1 < starts.length ? (starts[currentLine + 1] ?? text.length) - 1 : text.length;
  const column = preferredColumn ?? Math.max(0, bounded - currentStart);
  const targetLine = currentLine + direction;
  if (targetLine < 0 || targetLine >= starts.length) return bounded;
  const targetStart = starts[targetLine] ?? 0;
  const targetEnd = targetLine + 1 < starts.length ? (starts[targetLine + 1] ?? text.length) - 1 : text.length;
  return Math.min(targetEnd, targetStart + column);
}

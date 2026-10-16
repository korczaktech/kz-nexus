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

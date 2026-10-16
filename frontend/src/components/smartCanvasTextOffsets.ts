/**
 * UTF-16 offsets compatible with JavaScript string slicing, moved only across
 * complete Unicode code points so keyboard editing cannot split surrogate pairs.
 */
export function previousCodePointOffset(text: string, offset: number): number {
  const bounded = Math.max(0, Math.min(text.length, offset));
  if (bounded <= 0) return 0;
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
  const current = text.charCodeAt(bounded);
  if (current >= 0xd800 && current <= 0xdbff && bounded + 1 < text.length) {
    const trail = text.charCodeAt(bounded + 1);
    if (trail >= 0xdc00 && trail <= 0xdfff) return bounded + 2;
  }
  return bounded + 1;
}

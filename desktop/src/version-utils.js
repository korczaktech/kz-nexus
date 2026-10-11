export function versionParts(value) {
  return String(value).replace(/^v/, "").split(".").map((part) => {
    const parsed = Number.parseInt(part, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  });
}

export function newer(candidate, current) {
  const left = versionParts(candidate);
  const right = versionParts(current);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index] || 0;
    const b = right[index] || 0;
    if (a !== b) return a > b;
  }
  return false;
}

export function isSupportedReleaseTag(tag) {
  return /^v?0\.0\.0\.\d+$/.test(String(tag));
}

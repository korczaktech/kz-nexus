/**
 * Structural clone helper. Uses the platform `structuredClone` when
 * available (Node 18+, modern browsers) and falls back to a JSON
 * round-trip otherwise. The engine never mutates caller-owned documents in
 * place, relying on this helper at transaction/normalization boundaries.
 */
export function deepClone<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

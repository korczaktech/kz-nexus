/**
 * Recursively freezes a value so hosts cannot mutate engine-owned documents
 * through references returned by the public API (Section 5.6). The engine
 * itself always produces new objects on write, so this is a cheap safety net
 * rather than the primary isolation mechanism.
 */
export function deepFreeze<T>(value: T): T {
  if (value !== null && (typeof value === "object" || typeof value === "function") && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as unknown as Record<string, unknown>)[key]);
    }
  }
  return value;
}

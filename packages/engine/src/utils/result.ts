import type { EngineError } from "../errors/errors";

/**
 * Canonical result type used across the public API instead of throwing for
 * predictable failures. Programmer errors (bad arguments) may still throw.
 */
export type Result<T, E = EngineError> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok;
}

/** Unwraps a result, throwing the contained error if it failed. Intended for tests/examples. */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw result.error;
}

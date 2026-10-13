/**
 * Korczak Nexus Engine — Error model.
 *
 * All predictable failures in the engine are represented as `EngineError`
 * instances with a stable `code`. Generic `throw` is reserved for programmer
 * mistakes (invalid API usage), never for expected validation failures.
 */

export type EngineErrorCode =
  | "INVALID_DOCUMENT"
  | "NODE_NOT_FOUND"
  | "INVALID_POSITION"
  | "UNSUPPORTED_OPERATION"
  | "UNSUPPORTED_FORMAT"
  | "VERSION_MISMATCH"
  | "RESOURCE_NOT_FOUND"
  | "RESOURCE_IN_USE"
  | "LIMIT_EXCEEDED"
  | "MIGRATION_FAILED"
  | "CORRUPTED_CONTENT"
  | "TRANSACTION_REJECTED";

export interface EngineErrorOptions {
  path?: string;
  details?: unknown;
  cause?: unknown;
}

/**
 * Structured error used across the whole public API of the engine.
 * `path` points at the offending node when known (e.g. "content[2].children[0]").
 */
export class EngineError extends Error {
  readonly code: EngineErrorCode;
  readonly path?: string;
  readonly details?: unknown;

  constructor(code: EngineErrorCode, message: string, options: EngineErrorOptions = {}) {
    super(message);
    this.name = "EngineError";
    this.code = code;
    this.path = options.path;
    this.details = options.details;
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }

  toJSON(): { name: string; code: EngineErrorCode; message: string; path?: string; details?: unknown } {
    return { name: this.name, code: this.code, message: this.message, path: this.path, details: this.details };
  }
}

export function engineError(code: EngineErrorCode, message: string, options?: EngineErrorOptions): EngineError {
  return new EngineError(code, message, options);
}

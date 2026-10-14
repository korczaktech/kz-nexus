/**
 * Kortex document persistence boundary.
 *
 * NexusDocument is the canonical model. The .nsx envelope is its native
 * persistence format; HTML is deliberately excluded from this module.
 *
 * This adapter stays thin and delegates validation, size limits, migration,
 * normalization, and serialization to the engine's supported public API.
 */
import {
  openNsx,
  saveNsx,
  type IdGenerator,
  type NexusDocument,
  type Result,
  type EngineLimits,
} from "../../../packages/engine/src/index";

export const NSX_FILE_EXTENSION = ".nsx";

export interface EncodeNexusDocumentOptions {
  /** Override engine safety limits for controlled import/export environments. */
  limits?: EngineLimits;
}

export interface DecodeNexusDocumentOptions {
  /** Override engine safety limits for controlled import/export environments. */
  limits?: EngineLimits;
  /** Inject deterministic IDs when normalization needs to repair legacy data. */
  idGenerator?: IdGenerator;
}

/** Serialize the canonical model into the versioned native .nsx envelope. */
export function encodeNexusDocument(
  document: NexusDocument,
  options: EncodeNexusDocumentOptions = {},
): Result<string> {
  return saveNsx(document, options.limits);
}

/**
 * Parse and validate a native .nsx payload, including schema migration and
 * normalization. Invalid JSON, HTML, unsupported versions, and unsafe or
 * oversized documents are rejected by the engine.
 */
export function decodeNexusDocument(
  payload: string,
  options: DecodeNexusDocumentOptions = {},
): Result<NexusDocument> {
  return openNsx(payload, {
    ...(options.limits ? { limits: options.limits } : {}),
    ...(options.idGenerator ? { idGenerator: options.idGenerator } : {}),
  });
}

/**
 * Check a filename (not file contents) for the native extension.
 * Supports paths with either slash convention and case-insensitive extensions.
 */
export function isNsxFilename(filename: string): boolean {
  const normalized = filename.trim().replace(/\\/g, "/");
  const basename = normalized.slice(normalized.lastIndexOf("/") + 1);
  return basename.length > NSX_FILE_EXTENSION.length
    && basename.toLowerCase().endsWith(NSX_FILE_EXTENSION);
}

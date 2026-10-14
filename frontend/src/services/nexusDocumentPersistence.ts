/**
 * Kortex document persistence boundary.
 *
 * The canonical document model is serialized directly to the native .nsx
 * format. This module intentionally accepts no HTML and has no DOM dependency.
 * HTML remains a presentation/import-export format, not the source of truth.
 */
import {
  openNsx,
  saveNsx,
  type NexusDocument,
  type Result,
} from "../../../packages/engine/src/index";

export const NSX_FILE_EXTENSION = ".nsx";

/** Serialize the canonical Kortex model into a versioned .nsx payload. */
export function encodeNexusDocument(document: NexusDocument): Result<string> {
  return saveNsx(document);
}

/** Parse, migrate, normalize and validate a native .nsx payload. */
export function decodeNexusDocument(payload: string): Result<NexusDocument> {
  return openNsx(payload);
}

/** Returns true when a filename uses the native Nexus extension. */
export function isNsxFilename(filename: string): boolean {
  return filename.toLowerCase().endsWith(NSX_FILE_EXTENSION);
}

import type { NexusDocument } from "../model/types";

/** Official native format identifier. The file extension is always `.nsx`. */
export const NSX_FORMAT_ID = "korczak-nexus" as const;

export const CURRENT_NSX_FORMAT_VERSION = 1;

/**
 * Versioned envelope persisted to `.nsx` files. See docs/NSX_FORMAT.md for
 * the full specification, limits and compatibility policy.
 */
export interface NsxEnvelope {
  format: typeof NSX_FORMAT_ID;
  formatVersion: number;
  document: NexusDocument;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

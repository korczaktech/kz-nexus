/**
 * Schema constraints: node types known to this engine version, allowed
 * nesting rules, and safety limits enforced during validation/parsing.
 */
import type { Block } from "../model/types";

export const KNOWN_BLOCK_TYPES: ReadonlySet<Block["type"]> = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "thematicBreak",
  "bulletList",
  "orderedList",
  "table",
  "image",
]);

export const KNOWN_MARK_TYPES: ReadonlySet<string> = new Set([
  "bold",
  "italic",
  "underline",
  "strike",
  "color",
  "highlight",
  "fontSize",
  "fontFamily",
  "link",
]);

/** Allows safe web, email, and same-document anchor links; rejects executable schemes. */
export function isValidLink(value: string): boolean {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048 || /[\u0000-\u0020\u007f]/.test(value)) return false;
  return /^(?:https?:\/\/[^\s]+|mailto:[^\s@]+@[^\s@]+|#[A-Za-z][A-Za-z0-9_.:-]*)$/i.test(value);
}

/** Safety limits applied during validation and `.nsx` parsing (Section 9.7 / 19). */
export interface EngineLimits {
  maxDocumentBytes: number;
  maxNodes: number;
  maxTreeDepth: number;
  maxTextRunLength: number;
  maxResources: number;
  maxResourceBytes: number;
  maxMetadataEntries: number;
}

export const DEFAULT_LIMITS: EngineLimits = {
  maxDocumentBytes: 25 * 1024 * 1024, // 25 MB
  maxNodes: 50_000,
  maxTreeDepth: 64,
  maxTextRunLength: 100_000,
  maxResources: 500,
  maxResourceBytes: 10 * 1024 * 1024, // 10 MB per resource
  maxMetadataEntries: 64,
};

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function isValidColor(value: string): boolean {
  return HEX_COLOR_PATTERN.test(value);
}

export function isValidFontSize(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= 1000;
}

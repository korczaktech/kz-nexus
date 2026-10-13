import type { NexusDocument, Paragraph } from "../model/types";
import { CURRENT_SCHEMA_VERSION, DEFAULT_PAGE_CONFIG } from "../model/types";
import type { IdGenerator } from "../core/ids";
import type { Clock } from "../core/clock";

/**
 * Imports raw plain text into a new document. Each non-empty line becomes a
 * paragraph; consecutive blank lines are collapsed. This is intentionally
 * lossy (no structure, no formatting) — see docs/ARCHITECTURE.md Section 14
 * for the documented scope of importers in this version.
 */
export function importPlainText(text: string, generateId: IdGenerator, now: Clock): NexusDocument {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const nonEmpty = lines.filter((line) => line.trim().length > 0);
  const paragraphs: Paragraph[] = (nonEmpty.length > 0 ? nonEmpty : [""]).map((line) => ({
    type: "paragraph",
    id: generateId(),
    children: [{ type: "text", id: generateId(), text: line, marks: [] }],
  }));
  const timestamp = now();
  return {
    id: generateId(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    metadata: { title: "Imported document", createdAt: timestamp, updatedAt: timestamp },
    pageConfig: { ...DEFAULT_PAGE_CONFIG },
    content: paragraphs,
    resources: [],
  };
}

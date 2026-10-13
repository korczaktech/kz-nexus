import { describe, expect, it } from "vitest";
import { createIdGenerator } from "../core/ids";
import { createFixedClock } from "../core/clock";
import { createDocument } from "../commands/document";
import { normalizeDocument } from "./normalize";
import { deepClone } from "../utils/clone";
import { validateDocument } from "../validation/validate";
import type { NexusDocument } from "../model/types";

function baseDocument(): NexusDocument {
  return createDocument(createIdGenerator("n", 5), createFixedClock(0).now);
}

describe("normalizeDocument", () => {
  it("is idempotent: normalizing twice equals normalizing once", () => {
    const doc = baseDocument();
    const once = normalizeDocument(doc, createIdGenerator("n", 99));
    const twice = normalizeDocument(once, createIdGenerator("n", 99));
    expect(twice).toEqual(once);
  });

  it("merges adjacent text runs with identical marks", () => {
    const doc = deepClone(baseDocument());
    const paragraph = doc.content[0];
    if (paragraph.type === "paragraph") {
      paragraph.children = [
        { type: "text", id: "n_run0001", text: "Hello, ", marks: [{ type: "bold" }] },
        { type: "text", id: "n_run0002", text: "world", marks: [{ type: "bold" }] },
      ];
    }
    const normalized = normalizeDocument(doc, createIdGenerator("n", 1));
    const normalizedParagraph = normalized.content[0];
    expect(normalizedParagraph.type).toBe("paragraph");
    if (normalizedParagraph.type === "paragraph") {
      expect(normalizedParagraph.children).toHaveLength(1);
      expect(normalizedParagraph.children[0].text).toBe("Hello, world");
    }
  });

  it("does not merge runs with different marks", () => {
    const doc = deepClone(baseDocument());
    const paragraph = doc.content[0];
    if (paragraph.type === "paragraph") {
      paragraph.children = [
        { type: "text", id: "n_run0001", text: "Bold", marks: [{ type: "bold" }] },
        { type: "text", id: "n_run0002", text: "Plain", marks: [] },
      ];
    }
    const normalized = normalizeDocument(doc, createIdGenerator("n", 1));
    const normalizedParagraph = normalized.content[0];
    if (normalizedParagraph.type === "paragraph") {
      expect(normalizedParagraph.children).toHaveLength(2);
    }
  });

  it("drops empty text runs but keeps a single placeholder run when all are empty", () => {
    const doc = deepClone(baseDocument());
    const paragraph = doc.content[0];
    if (paragraph.type === "paragraph") {
      paragraph.children = [
        { type: "text", id: "n_run0001", text: "", marks: [] },
        { type: "text", id: "n_run0002", text: "", marks: [] },
      ];
    }
    const normalized = normalizeDocument(doc, createIdGenerator("n", 1));
    const normalizedParagraph = normalized.content[0];
    if (normalizedParagraph.type === "paragraph") {
      expect(normalizedParagraph.children).toHaveLength(1);
      expect(normalizedParagraph.children[0].text).toBe("");
    }
  });

  it("regenerates duplicate ids deterministically without touching valid unique ids", () => {
    const doc = deepClone(baseDocument());
    const paragraph = doc.content[0];
    if (paragraph.type === "paragraph") {
      doc.content.push({ type: "paragraph", id: paragraph.id, children: [{ type: "text", id: "n_other01", text: "dup", marks: [] }] });
    }
    const normalized = normalizeDocument(doc, createIdGenerator("fix", 3));
    const ids = normalized.content.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(normalized.content[0].id).toBe(paragraph.id); // first occurrence keeps its id
  });

  it("clamps out-of-range heading levels into 1-6", () => {
    const doc = deepClone(baseDocument()) as unknown as { content: Array<Record<string, unknown>> };
    doc.content = [{ type: "heading", id: "n_head0001", level: 42, children: [{ type: "text", id: "n_text0001", text: "Title", marks: [] }] }];
    const normalized = normalizeDocument(doc as unknown as NexusDocument, createIdGenerator("n", 1));
    const heading = normalized.content[0];
    expect(heading.type).toBe("heading");
    if (heading.type === "heading") expect(heading.level).toBe(6);
  });

  it("produces a document that still passes validation", () => {
    const doc = baseDocument();
    const normalized = normalizeDocument(doc, createIdGenerator("n", 1));
    expect(validateDocument(normalized).ok).toBe(true);
  });

  it("never mutates the original document", () => {
    const doc = baseDocument();
    const before = JSON.stringify(doc);
    normalizeDocument(doc, createIdGenerator("n", 1));
    expect(JSON.stringify(doc)).toBe(before);
  });
});

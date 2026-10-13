import { describe, expect, it } from "vitest";
import { createIdGenerator } from "../core/ids";
import { createFixedClock } from "../core/clock";
import { createDocument } from "../commands/document";
import { validateDocument, collectValidationIssues } from "./validate";
import type { NexusDocument } from "../model/types";
import { deepClone } from "../utils/clone";

function baseDocument(): NexusDocument {
  return createDocument(createIdGenerator("n", 10), createFixedClock(0).now);
}

describe("validateDocument", () => {
  it("accepts a freshly created document", () => {
    const result = validateDocument(baseDocument());
    expect(result.ok).toBe(true);
  });

  it("does not mutate the document being validated", () => {
    const doc = baseDocument();
    const before = JSON.stringify(doc);
    validateDocument(doc);
    expect(JSON.stringify(doc)).toBe(before);
  });

  it("rejects a document with an empty content array", () => {
    const doc = deepClone(baseDocument());
    doc.content = [];
    const result = validateDocument(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_DOCUMENT");
  });

  it("rejects duplicate node ids", () => {
    const doc = deepClone(baseDocument());
    const paragraph = doc.content[0];
    if (paragraph.type === "paragraph") {
      doc.content.push({ ...paragraph });
    }
    const issues = collectValidationIssues(doc);
    expect(issues.some((issue) => issue.message.includes("Duplicate node id"))).toBe(true);
  });

  it("rejects an unknown block type", () => {
    const doc = deepClone(baseDocument()) as unknown as { content: unknown[] };
    doc.content.push({ type: "mystery-block", id: "n_xxxxaa" });
    const result = validateDocument(doc as unknown as NexusDocument);
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid color mark", () => {
    const doc = deepClone(baseDocument());
    const paragraph = doc.content[0];
    if (paragraph.type === "paragraph") {
      paragraph.children[0].text = "hi";
      paragraph.children[0].marks = [{ type: "color", value: "not-a-color" }];
    }
    const result = validateDocument(doc);
    expect(result.ok).toBe(false);
  });

  it("rejects an image referencing a missing resource", () => {
    const doc = deepClone(baseDocument());
    doc.content.push({ type: "image", id: "n_img0001", resourceId: "missing", alt: "x" });
    const result = validateDocument(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("RESOURCE_NOT_FOUND");
  });

  it("enforces the maxNodes limit", () => {
    const doc = deepClone(baseDocument());
    for (let i = 0; i < 10; i++) {
      doc.content.push({ type: "paragraph", id: `n_extra${i}aa`, children: [{ type: "text", id: `n_txt${i}aaa`, text: "x", marks: [] }] });
    }
    const result = validateDocument(doc, { ...DEFAULT_TEST_LIMITS, maxNodes: 5 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("LIMIT_EXCEEDED");
  });
});

const DEFAULT_TEST_LIMITS = {
  maxDocumentBytes: 25 * 1024 * 1024,
  maxNodes: 50_000,
  maxTreeDepth: 64,
  maxTextRunLength: 100_000,
  maxResources: 500,
  maxResourceBytes: 10 * 1024 * 1024,
  maxMetadataEntries: 64,
};

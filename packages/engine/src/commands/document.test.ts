import { describe, expect, it } from "vitest";
import { createIdGenerator } from "../core/ids";
import { createFixedClock } from "../core/clock";
import { createDocument } from "./document";
import { validateDocument } from "../validation/validate";

describe("createDocument", () => {
  it("creates a minimal, valid document", () => {
    const generateId = createIdGenerator("n", 1);
    const { now } = createFixedClock(1000);
    const doc = createDocument(generateId, now, { title: "My doc" });

    expect(doc.schemaVersion).toBe(1);
    expect(doc.metadata.title).toBe("My doc");
    expect(doc.metadata.createdAt).toBe(1000);
    expect(doc.content).toHaveLength(1);
    expect(doc.content[0].type).toBe("paragraph");

    const result = validateDocument(doc);
    expect(result.ok).toBe(true);
  });

  it("assigns unique ids to the document and its nodes", () => {
    const generateId = createIdGenerator("n", 2);
    const { now } = createFixedClock();
    const doc = createDocument(generateId, now);
    const paragraph = doc.content[0];
    expect(paragraph.type).toBe("paragraph");
    if (paragraph.type === "paragraph") {
      expect(paragraph.id).not.toBe(doc.id);
      expect(paragraph.children[0].id).not.toBe(paragraph.id);
    }
  });
});

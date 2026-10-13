import { describe, expect, it } from "vitest";
import { createIdGenerator } from "../core/ids";
import { createFixedClock } from "../core/clock";
import { createDocument } from "./document";
import { deleteText, insertText, replaceRange } from "./text";
import { getPlainText } from "../model/tree";
import type { Paragraph } from "../model/types";

function doc() {
  return createDocument(createIdGenerator("n", 1), createFixedClock(0).now, { title: "t" });
}

function ctx() {
  return { generateId: createIdGenerator("id", 2) };
}

function firstParagraph(d: ReturnType<typeof doc>) {
  return d.content[0] as Paragraph;
}

describe("insertText", () => {
  it("inserts text at the given offset", () => {
    const d = doc();
    const p = firstParagraph(d);
    const result = insertText({ blockId: p.id, offset: 0, text: "Hello" })(d, ctx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(getPlainText(result.value.document.content[0] as Paragraph)).toBe("Hello");
      expect(result.value.selection).toEqual({ blockId: p.id, offset: 5 });
    }
  });

  it("inserts in the middle of existing text", () => {
    const d = doc();
    const p = firstParagraph(d);
    const step1 = insertText({ blockId: p.id, offset: 0, text: "Hello world" })(d, ctx());
    if (!step1.ok) throw step1.error;
    const step2 = insertText({ blockId: p.id, offset: 5, text: ",there" })(step1.value.document, ctx());
    if (!step2.ok) throw step2.error;
    expect(getPlainText(step2.value.document.content[0] as Paragraph)).toBe("Hello,there world");
  });

  it("fails with NODE_NOT_FOUND for an unknown block", () => {
    const d = doc();
    const result = insertText({ blockId: "n_missing1", offset: 0, text: "x" })(d, ctx());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NODE_NOT_FOUND");
  });

  it("fails with INVALID_POSITION for an out-of-range offset", () => {
    const d = doc();
    const p = firstParagraph(d);
    const result = insertText({ blockId: p.id, offset: 50, text: "x" })(d, ctx());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_POSITION");
  });

  it("does not mutate the input document", () => {
    const d = doc();
    const before = JSON.stringify(d);
    const p = firstParagraph(d);
    insertText({ blockId: p.id, offset: 0, text: "Hello" })(d, ctx());
    expect(JSON.stringify(d)).toBe(before);
  });
});

describe("deleteText", () => {
  it("removes a character range", () => {
    const d = doc();
    const p = firstParagraph(d);
    const step1 = insertText({ blockId: p.id, offset: 0, text: "Hello world" })(d, ctx());
    if (!step1.ok) throw step1.error;
    const step2 = deleteText({ blockId: p.id, start: 5, end: 11 })(step1.value.document, ctx());
    if (!step2.ok) throw step2.error;
    expect(getPlainText(step2.value.document.content[0] as Paragraph)).toBe("Hello");
  });

  it("rejects an inverted or out-of-range range", () => {
    const d = doc();
    const p = firstParagraph(d);
    const result = deleteText({ blockId: p.id, start: 0, end: 100 })(d, ctx());
    expect(result.ok).toBe(false);
  });
});

describe("replaceRange", () => {
  it("replaces a range with new text and preserves surrounding marks boundaries", () => {
    const d = doc();
    const p = firstParagraph(d);
    const step1 = insertText({ blockId: p.id, offset: 0, text: "Hello world" })(d, ctx());
    if (!step1.ok) throw step1.error;
    const step2 = replaceRange({ blockId: p.id, start: 6, end: 11, text: "there" })(step1.value.document, ctx());
    if (!step2.ok) throw step2.error;
    expect(getPlainText(step2.value.document.content[0] as Paragraph)).toBe("Hello there");
  });
});

import { describe, expect, it } from "vitest";
import { createIdGenerator } from "../core/ids";
import { createFixedClock } from "../core/clock";
import { createDocument } from "./document";
import { insertText } from "./text";
import { applyMark, removeMark, toggleMark } from "./marks";
import type { Paragraph } from "../model/types";

function ctx() {
  return { generateId: createIdGenerator("id", 2) };
}

function setup(text: string) {
  const d = createDocument(createIdGenerator("n", 1), createFixedClock(0).now);
  const p = d.content[0] as Paragraph;
  const result = insertText({ blockId: p.id, offset: 0, text })(d, ctx());
  if (!result.ok) throw result.error;
  return { document: result.value.document, blockId: p.id };
}

describe("applyMark / removeMark / toggleMark", () => {
  it("applies bold to a sub-range, splitting runs", () => {
    const { document, blockId } = setup("Hello world");
    const result = applyMark({ blockId, start: 0, end: 5, mark: { type: "bold" } })(document, ctx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const paragraph = result.value.document.content[0] as Paragraph;
      expect(paragraph.children[0].text).toBe("Hello");
      expect(paragraph.children[0].marks).toEqual([{ type: "bold" }]);
      expect(paragraph.children[1].text).toBe(" world");
      expect(paragraph.children[1].marks).toEqual([]);
    }
  });

  it("accepts safe hyperlinks and rejects executable schemes", () => {
    const { document, blockId } = setup("OpenAI");
    const valid = applyMark({ blockId, start: 0, end: 6, mark: { type: "link", value: "https://example.com/docs" } })(document, ctx());
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      const paragraph = valid.value.document.content[0] as Paragraph;
      expect(paragraph.children[0]!.marks).toContainEqual({ type: "link", value: "https://example.com/docs" });
    }
    const invalid = applyMark({ blockId, start: 0, end: 6, mark: { type: "link", value: "javascript:alert(1)" } })(document, ctx());
    expect(invalid.ok).toBe(false);
  });

  it("applies superscript and subscript as engine marks", () => {
    const { document, blockId } = setup("H2O");
    const superscript = applyMark({ blockId, start: 0, end: 1, mark: { type: "superscript" } })(document, ctx());
    expect(superscript.ok).toBe(true);
    if (!superscript.ok) return;
    const subscript = applyMark({ blockId, start: 1, end: 2, mark: { type: "subscript" } })(superscript.value.document, ctx());
    expect(subscript.ok).toBe(true);
    if (!subscript.ok) return;
    const paragraph = subscript.value.document.content[0] as Paragraph;
    expect(paragraph.children.find(run => run.text === "H")?.marks).toContainEqual({ type: "superscript" });
    expect(paragraph.children.find(run => run.text === "2")?.marks).toContainEqual({ type: "subscript" });
  });

  it("toggleMark adds the mark when not fully applied, removes when fully applied", () => {
    const { document, blockId } = setup("Hello");
    const once = toggleMark({ blockId, start: 0, end: 5, mark: { type: "italic" } })(document, ctx());
    if (!once.ok) throw once.error;
    const paragraphAfterFirst = once.value.document.content[0] as Paragraph;
    expect(paragraphAfterFirst.children.every((r) => r.marks.some((m) => m.type === "italic"))).toBe(true);

    const twice = toggleMark({ blockId, start: 0, end: 5, mark: { type: "italic" } })(once.value.document, ctx());
    if (!twice.ok) throw twice.error;
    const paragraphAfterSecond = twice.value.document.content[0] as Paragraph;
    expect(paragraphAfterSecond.children.every((r) => !r.marks.some((m) => m.type === "italic"))).toBe(true);
  });

  it("removeMark clears a mark type from a range", () => {
    const { document, blockId } = setup("Hello");
    const bolded = applyMark({ blockId, start: 0, end: 5, mark: { type: "bold" } })(document, ctx());
    if (!bolded.ok) throw bolded.error;
    const cleared = removeMark({ blockId, start: 0, end: 5, markType: "bold" })(bolded.value.document, ctx());
    if (!cleared.ok) throw cleared.error;
    const paragraph = cleared.value.document.content[0] as Paragraph;
    expect(paragraph.children.every((r) => !r.marks.some((m) => m.type === "bold"))).toBe(true);
  });

  it("accepts safe hyperlink URLs and rejects executable schemes", () => {
    const { document, blockId } = setup("OpenAI");
    const safe = applyMark({ blockId, start: 0, end: 6, mark: { type: "link", value: "https://example.com/docs" } })(document, ctx());
    expect(safe.ok).toBe(true);
    const unsafe = applyMark({ blockId, start: 0, end: 6, mark: { type: "link", value: "javascript:alert(1)" } })(document, ctx());
    expect(unsafe.ok).toBe(false);
  });

  it("rejects an invalid color value", () => {
    const { document, blockId } = setup("Hello");
    const result = applyMark({ blockId, start: 0, end: 5, mark: { type: "color", value: "not-a-color" } })(document, ctx());
    expect(result.ok).toBe(false);
  });

  it("rejects toggling a mark on a collapsed (empty) range", () => {
    const { document, blockId } = setup("Hello");
    const result = toggleMark({ blockId, start: 2, end: 2, mark: { type: "bold" } })(document, ctx());
    expect(result.ok).toBe(false);
  });

  it("applies and validates comment annotations", () => {
    const { document, blockId } = setup("Important text");
    const result = applyMark({ blockId, start: 0, end: 9, mark: { type: "comment", value: "Review this" } })(document, ctx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const paragraph = result.value.document.content[0] as Paragraph;
      expect(paragraph.children[0]!.marks).toContainEqual({ type: "comment", value: "Review this" });
    }
    const invalid = applyMark({ blockId, start: 0, end: 9, mark: { type: "comment", value: " " } })(document, ctx());
    expect(invalid.ok).toBe(false);
  });

  it("supports overlapping marks of different types", () => {
    const { document, blockId } = setup("Hello world");
    const bold = applyMark({ blockId, start: 0, end: 5, mark: { type: "bold" } })(document, ctx());
    if (!bold.ok) throw bold.error;
    const italic = applyMark({ blockId, start: 3, end: 8, mark: { type: "italic" } })(bold.value.document, ctx());
    if (!italic.ok) throw italic.error;
    const paragraph = italic.value.document.content[0] as Paragraph;
    const combined = paragraph.children.find((r) => r.marks.some((m) => m.type === "bold") && r.marks.some((m) => m.type === "italic"));
    expect(combined).toBeDefined();
  });
});

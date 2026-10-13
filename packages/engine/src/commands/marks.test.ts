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

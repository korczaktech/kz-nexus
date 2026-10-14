import { describe, expect, it } from "vitest";
import { createIdGenerator } from "../core/ids";
import { createFixedClock } from "../core/clock";
import { createDocument } from "../commands/document";
import { updateParagraphLike } from "./tree";

describe("updateParagraphLike", () => {
  it("copies only the top-level path containing the edited paragraph", () => {
    const ids = createIdGenerator("tree", 1);
    const now = createFixedClock(0).now;
    const first = createDocument(ids, now, { title: "first" }).content[0]!;
    const second = createDocument(ids, now, { title: "second" }).content[0]!;
    const blocks = [first, second];

    const result = updateParagraphLike(blocks, first.id, node => ({ ...node, indent: 12 }));

    expect(result.found).toBe(true);
    expect(result.blocks).not.toBe(blocks);
    expect(result.blocks[0]).not.toBe(first);
    expect(result.blocks[1]).toBe(second);
    expect(first.type === "paragraph" ? first.indent : undefined).toBeUndefined();
    expect(result.blocks[0]?.type === "paragraph" ? result.blocks[0].indent : undefined).toBe(12);
  });

  it("returns the original array when the paragraph is absent", () => {
    const document = createDocument(createIdGenerator("tree", 1), createFixedClock(0).now);
    const result = updateParagraphLike(document.content, "missing-paragraph", node => node);

    expect(result.found).toBe(false);
    expect(result.blocks).toBe(document.content);
  });
});

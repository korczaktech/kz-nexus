import { describe, expect, it } from "vitest";
import { createIdGenerator } from "../core/ids";
import { createFixedClock } from "../core/clock";
import { createDocument } from "./document";
import { insertText } from "./text";
import { convertBlockToBlockquote, deleteBlock, insertParagraphAfter, mergeBlockWithPrevious, setAlign, setHeadingLevel, splitBlock } from "./block";
import { getPlainText } from "../model/tree";
import type { Paragraph } from "../model/types";
import { validateDocument } from "../validation/validate";

const generateTestId = createIdGenerator("id", 3);
function ctx() {
  return { generateId: generateTestId };
}

function setup(text: string) {
  const d = createDocument(createIdGenerator("n", 1), createFixedClock(0).now);
  const p = d.content[0] as Paragraph;
  const result = insertText({ blockId: p.id, offset: 0, text })(d, ctx());
  if (!result.ok) throw result.error;
  return { document: result.value.document, blockId: p.id };
}

describe("convertBlockToBlockquote", () => {
  it("converts a paragraph to a quote and preserves its text", () => {
    const { document, blockId } = setup("Quoted text");
    const result = convertBlockToBlockquote({ blockId })(document, ctx());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.document.content[0].type).toBe("blockquote");
    const quote = result.value.document.content[0];
    if (quote.type === "blockquote") expect(getPlainText(quote.children[0])).toBe("Quoted text");
    expect(validateDocument(result.value.document).ok).toBe(true);
  });
});

describe("setAlign / setHeadingLevel", () => {
  it("sets paragraph alignment", () => {
    const { document, blockId } = setup("Hello");
    const result = setAlign({ blockId, align: "center" })(document, ctx());
    expect(result.ok).toBe(true);
    if (result.ok) expect((result.value.document.content[0] as Paragraph).align).toBe("center");
  });

  it("converts a paragraph into a heading and back", () => {
    const { document, blockId } = setup("Title");
    const asHeading = setHeadingLevel({ blockId, level: 2 })(document, ctx());
    if (!asHeading.ok) throw asHeading.error;
    expect(asHeading.value.document.content[0].type).toBe("heading");
    const backToParagraph = setHeadingLevel({ blockId, level: "paragraph" })(asHeading.value.document, ctx());
    if (!backToParagraph.ok) throw backToParagraph.error;
    expect(backToParagraph.value.document.content[0].type).toBe("paragraph");
  });
});

describe("splitBlock / mergeBlockWithPrevious", () => {
  it("splits a paragraph into two at the given offset", () => {
    const { document, blockId } = setup("Hello world");
    const result = splitBlock({ blockId, offset: 5 })(document, ctx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.document.content).toHaveLength(2);
      expect(getPlainText(result.value.document.content[0] as Paragraph)).toBe("Hello");
      expect(getPlainText(result.value.document.content[1] as Paragraph)).toBe(" world");
      expect(result.value.selection?.offset).toBe(0);
    }
  });

  it("merging the split result restores the original text", () => {
    const { document, blockId } = setup("Hello world");
    const split = splitBlock({ blockId, offset: 5 })(document, ctx());
    if (!split.ok) throw split.error;
    const secondBlockId = split.value.document.content[1].id;
    const merged = mergeBlockWithPrevious({ blockId: secondBlockId })(split.value.document, ctx());
    if (!merged.ok) throw merged.error;
    expect(merged.value.document.content).toHaveLength(1);
    expect(getPlainText(merged.value.document.content[0] as Paragraph)).toBe("Hello world");
  });

  it("fails to merge the first block (no previous sibling)", () => {
    const { document, blockId } = setup("Hello");
    const result = mergeBlockWithPrevious({ blockId })(document, ctx());
    expect(result.ok).toBe(false);
  });
});

describe("insertParagraphAfter / deleteBlock", () => {
  it("inserts an empty paragraph after a block and focuses it", () => {
    const { document, blockId } = setup("Hello");
    const result = insertParagraphAfter({ blockId })(document, ctx());
    if (!result.ok) throw result.error;
    expect(result.value.document.content).toHaveLength(2);
    expect(result.value.selection?.offset).toBe(0);
  });

  it("deletes a block and refuses to delete the last remaining block", () => {
    const { document, blockId } = setup("Hello");
    const withSecond = insertParagraphAfter({ blockId })(document, ctx());
    if (!withSecond.ok) throw withSecond.error;
    const secondId = withSecond.value.document.content[1].id;
    const deleted = deleteBlock({ blockId: secondId })(withSecond.value.document, ctx());
    if (!deleted.ok) throw deleted.error;
    expect(deleted.value.document.content).toHaveLength(1);

    const lastOne = deleteBlock({ blockId: deleted.value.document.content[0].id })(deleted.value.document, ctx());
    expect(lastOne.ok).toBe(false);
  });
});

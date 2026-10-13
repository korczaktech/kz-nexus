import { describe, expect, it } from "vitest";
import { createIdGenerator } from "../core/ids";
import { createFixedClock } from "../core/clock";
import { createDocument } from "./document";
import { insertText } from "./text";
import { insertImportedBlocksAtSelection } from "./importedBlocks";
import { getPlainText } from "../model/tree";
import { validateDocument } from "../validation/validate";
import type { Block, Paragraph } from "../model/types";

function context() {
  return { generateId: createIdGenerator("engine", 7) };
}

function sourceDocument(text: string) {
  const doc = createDocument(createIdGenerator("source", 1), createFixedClock(0).now);
  const block = doc.content[0] as Paragraph;
  const inserted = insertText({ blockId: block.id, offset: 0, text })(doc, context());
  if (!inserted.ok) throw inserted.error;
  return { document: inserted.value.document, blockId: block.id };
}

describe("insertImportedBlocksAtSelection", () => {
  it("replaces a text selection with imported inline content and preserves both sides", () => {
    const { document, blockId } = sourceDocument("Hello world");
    const imported: Block = {
      type: "paragraph",
      id: "import-p",
      children: [{ type: "text", id: "import-run", text: "beautiful", marks: [{ type: "bold" }] }],
    };
    const result = insertImportedBlocksAtSelection({ blockId, start: 6, end: 11, blocks: [imported] })(document, context());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const paragraph = result.value.document.content[0] as Paragraph;
    expect(getPlainText(paragraph)).toBe("Hello beautiful");
    expect(paragraph.children.some(run => run.marks.some(mark => mark.type === "bold"))).toBe(true);
    expect(validateDocument(result.value.document).ok).toBe(true);
  });

  it("inserts multiple structural blocks and keeps the trailing text", () => {
    const { document, blockId } = sourceDocument("before AFTER");
    const imported: Block[] = [
      { type: "paragraph", id: "import-a", children: [{ type: "text", id: "import-ar", text: "middle", marks: [] }] },
      { type: "bulletList", id: "import-list", children: [{ type: "listItem", id: "import-item", children: [{ type: "paragraph", id: "import-li-p", children: [{ type: "text", id: "import-li-run", text: "list item", marks: [] }] }] }] },
    ];
    const result = insertImportedBlocksAtSelection({ blockId, start: 7, end: 12, blocks: imported })(document, context());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.document.content.map(block => block.type)).toEqual(["paragraph", "bulletList", "paragraph"]);
    expect(getPlainText(result.value.document.content[0] as Paragraph)).toBe("before ");
    expect(getPlainText(result.value.document.content[1] as Block & { children: Array<{ children: Array<{ children: Array<{ text: string }> }> }> })).toBeDefined();
    expect(getPlainText(result.value.document.content[2] as Paragraph)).toBe("");
    expect(validateDocument(result.value.document).ok).toBe(true);
  });
});

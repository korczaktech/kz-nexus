import { describe, expect, it } from "vitest";
import { createIdGenerator } from "../core/ids";
import { createFixedClock } from "../core/clock";
import { createDocument } from "./document";
import { insertText } from "./text";
import { insertImportedBlocksAtSelection, insertImportedBlocksAtNestedSelection } from "./importedBlocks";
import { insertTable } from "./table";
import { createEditor } from "../editor/editor";
import { deleteText } from "./text";
import { mergeBlockWithPrevious, insertParagraphAfter } from "./block";
import { getPlainText } from "../model/tree";
import { validateDocument } from "../validation/validate";
import type { Block, Paragraph } from "../model/types";

const generateTestId = createIdGenerator("engine", 7);

function context() {
  return { generateId: generateTestId };
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

  it("composes a cross-paragraph replacement into one engine transaction", () => {
    const { document, blockId } = sourceDocument("before unwanted");
    const engine = createEditor({ document });
    const insertedParagraph = engine.exec([insertParagraphAfter({ blockId })]);
    expect(insertedParagraph.ok).toBe(true);
    const second = engine.getDocument().content[1] as Paragraph;
    const secondText = engine.exec([insertText({ blockId: second.id, offset: 0, text: "unwanted after" })]);
    expect(secondText.ok).toBe(true);
    const imported: Block = { type: "paragraph", id: "imported-middle", children: [{ type: "text", id: "imported-middle-run", text: "middle ", marks: [] }] };
    const result = engine.exec([
      deleteText({ blockId, start: 7, end: 15 }),
      deleteText({ blockId: second.id, start: 0, end: 9 }),
      mergeBlockWithPrevious({ blockId: second.id }),
      insertImportedBlocksAtSelection({ blockId, start: 7, end: 7, blocks: [imported] }),
    ]);
    expect(result.ok).toBe(true);
    expect(engine.getDocument().content).toHaveLength(1);
    expect(getPlainText(engine.getDocument().content[0] as Paragraph)).toBe("before middle after");
    expect(validateDocument(engine.getDocument()).ok).toBe(true);
    engine.dispose();
  });

  it("rekeys embedded image resources when importing an image block", () => {
    const { document, blockId } = sourceDocument("replace");
    const resource = { id: "import-resource", kind: "image" as const, mimeType: "image/png", data: "aGVsbG8=", byteLength: 5, name: "image.png" };
    const image: Block = { type: "image", id: "import-image", resourceId: resource.id, alt: "Imported image" };
    const result = insertImportedBlocksAtSelection({ blockId, start: 0, end: 7, blocks: [image], resources: [resource] })(document, context());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const importedImage = result.value.document.content.find(block => block.type === "image");
    expect(importedImage?.type).toBe("image");
    if (importedImage?.type !== "image") return;
    expect(importedImage.resourceId).not.toBe(resource.id);
    expect(result.value.document.resources.some(item => item.id === importedImage.resourceId)).toBe(true);
    expect(validateDocument(result.value.document).ok).toBe(true);
  });

  it("inserts multiple structural blocks and keeps the trailing text", () => {
    const { document, blockId } = sourceDocument("before X after");
    const imported: Block[] = [
      { type: "paragraph", id: "import-a", children: [{ type: "text", id: "import-ar", text: "middle", marks: [] }] },
      { type: "bulletList", id: "import-list", children: [{ type: "listItem", id: "import-item", children: [{ type: "paragraph", id: "import-li-p", children: [{ type: "text", id: "import-li-run", text: "list item", marks: [] }] }] }] },
    ];
    const result = insertImportedBlocksAtSelection({ blockId, start: 7, end: 8, blocks: imported })(document, context());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.document.content.map(block => block.type)).toEqual(["paragraph", "paragraph", "bulletList", "paragraph"]);
    expect(getPlainText(result.value.document.content[0] as Paragraph)).toBe("before ");
    const list = result.value.document.content[2];
    expect(list?.type).toBe("bulletList");
    if (list?.type === "bulletList") expect(getPlainText(list.children[0]!.children[0] as Paragraph)).toBe("list item");
    expect(getPlainText(result.value.document.content[3] as Paragraph)).toBe(" after");
    expect(validateDocument(result.value.document).ok).toBe(true);
  });
});


describe("insertImportedBlocksAtNestedSelection", () => {
  it("preserves multiple rich paragraphs inside a table cell", () => {
    const ids = createIdGenerator("nested", 1);
    const document = createDocument(ids, createFixedClock(0).now);
    const anchor = document.content[0]!;
    const tableResult = insertTable({ afterBlockId: anchor.id, rows: 1, columns: 1 })(document, { generateId: ids });
    if (!tableResult.ok) throw tableResult.error;
    const tableIndex = tableResult.value.document.content.findIndex(block => block.type === "table");
    const table = tableResult.value.document.content[tableIndex]!;
    if (table.type !== "table") throw new Error("table fixture missing");
    const target = table.children[0]!.children[0]!.children[0]!;
    const incoming: Block[] = [
      { type: "paragraph", id: "incoming-one", children: [{ type: "text", id: "run-one", text: "First", marks: [{ type: "bold" }] }] },
      { type: "heading", id: "incoming-two", level: 2, children: [{ type: "text", id: "run-two", text: "Second", marks: [{ type: "italic" }] }] },
    ];
    const result = insertImportedBlocksAtNestedSelection({ blockId: target.id, start: 0, end: 0, blocks: incoming })(tableResult.value.document, { generateId: ids });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const updatedTable = result.value.document.content[tableIndex]!;
    if (updatedTable.type !== "table") throw new Error("updated table missing");
    const paragraphs = updatedTable.children[0]!.children[0]!.children.filter((child): child is Paragraph => child.type === "paragraph");
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs.map(paragraph => getPlainText(paragraph))).toEqual(["First", "Second"]);
    expect(paragraphs[0]!.children[0]!.marks).toContainEqual({ type: "bold" });
    expect(paragraphs[1]!.children[0]!.marks).toContainEqual({ type: "italic" });
    expect(validateDocument(result.value.document).ok).toBe(true);
  });
});

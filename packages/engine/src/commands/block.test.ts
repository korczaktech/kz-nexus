import { describe, expect, it } from "vitest";
import { createIdGenerator } from "../core/ids";
import { createFixedClock } from "../core/clock";
import { createDocument } from "./document";
import { insertText } from "./text";
import { convertBlockToBlockquote, deleteBlock, insertParagraphAfter, mergeBlockWithPrevious, setAlign, setIndent, setParagraphStyle, setHeadingLevel, splitBlock } from "./block";
import { getPlainText } from "../model/tree";
import { insertTable } from "./table";
import type { Block, Paragraph } from "../model/types";
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

describe("nested split/merge", () => {
  it("splits and merges paragraphs inside a table cell", () => {
    const { document, blockId } = setup("");
    const inserted = insertTable({ afterBlockId: blockId, rows: 1, columns: 1 })(document, ctx());
    if (!inserted.ok) throw inserted.error;
    const table = inserted.value.document.content.find(block => block.type === "table");
    if (!table || table.type !== "table") throw new Error("table fixture missing");
    const paragraph = table.children[0]!.children[0]!.children[0]!;
    const text = insertText({ blockId: paragraph.id, offset: 0, text: "hello world" })(inserted.value.document, ctx());
    if (!text.ok) throw text.error;
    const split = splitBlock({ blockId: paragraph.id, offset: 5 })(text.value.document, ctx());
    expect(split.ok).toBe(true);
    if (!split.ok) return;
    const splitTable = split.value.document.content.find(block => block.type === "table");
    if (!splitTable || splitTable.type !== "table") throw new Error("split table missing");
    const cell = splitTable.children[0]!.children[0]!;
    expect(cell.children).toHaveLength(2);
    expect(getPlainText(cell.children[0]!)).toBe("hello");
    expect(getPlainText(cell.children[1]!)).toBe(" world");
    const merged = mergeBlockWithPrevious({ blockId: cell.children[1]!.id })(split.value.document, ctx());
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    const mergedTable = merged.value.document.content.find(block => block.type === "table");
    if (!mergedTable || mergedTable.type !== "table") throw new Error("merged table missing");
    expect(mergedTable.children[0]!.children[0]!.children).toHaveLength(1);
    expect(getPlainText(mergedTable.children[0]!.children[0]!.children[0]!)).toBe("hello world");
    expect(validateDocument(merged.value.document).ok).toBe(true);
  });

  it("splits a table-cell paragraph without duplicating or reordering other cell children", () => {
    const { document, blockId } = setup("");
    const inserted = insertTable({ afterBlockId: blockId, rows: 1, columns: 1 })(document, ctx());
    if (!inserted.ok) throw inserted.error;
    const table = inserted.value.document.content.find(block => block.type === "table");
    if (!table || table.type !== "table") throw new Error("table fixture missing");
    const row = table.children[0]!;
    const cell = row.children[0]!;
    const firstParagraph = cell.children[0]!;
    if (firstParagraph.type !== "paragraph") throw new Error("first cell paragraph missing");
    const makeId = ctx().generateId;
    const separator: Block = { type: "thematicBreak", id: makeId() };
    const secondParagraph: Paragraph = {
      type: "paragraph",
      id: makeId(),
      children: [{ type: "text", id: makeId(), text: "second paragraph", marks: [] }],
    };
    const withSiblings = {
      ...inserted.value.document,
      content: inserted.value.document.content.map(block => block.id !== table.id ? block : ({
        ...table,
        children: table.children.map((tableRow, rowIndex) => rowIndex !== 0 ? tableRow : ({
          ...tableRow,
          children: tableRow.children.map((tableCell, cellIndex) => cellIndex !== 0 ? tableCell : ({
            ...tableCell,
            children: [firstParagraph, separator, secondParagraph],
          })),
        })),
      })),
    };
    const split = splitBlock({ blockId: secondParagraph.id, offset: 6 })(withSiblings, ctx());
    if (!split.ok) throw split.error;
    const splitTable = split.value.document.content.find(block => block.type === "table");
    if (!splitTable || splitTable.type !== "table") throw new Error("split table missing");
    const splitCell = splitTable.children[0]!.children[0]!;
    expect(splitCell.children.map(child => child.type)).toEqual(["paragraph", "thematicBreak", "paragraph", "paragraph"]);
    expect(getPlainText(splitCell.children[0]!)).toBe("");
    expect(getPlainText(splitCell.children[2]!)).toBe("second");
    expect(getPlainText(splitCell.children[3]!)).toBe(" paragraph");
    expect(validateDocument(split.value.document).ok).toBe(true);
  });

  it("splits and merges paragraphs inside a blockquote", () => {
    const { document, blockId } = setup("hello world");
    const quoted = convertBlockToBlockquote({ blockId })(document, ctx());
    if (!quoted.ok) throw quoted.error;
    const split = splitBlock({ blockId, offset: 5 })(quoted.value.document, ctx());
    expect(split.ok).toBe(true);
    if (!split.ok) return;
    const quote = split.value.document.content[0];
    expect(quote.type).toBe("blockquote");
    if (quote.type !== "blockquote") return;
    expect(quote.children).toHaveLength(2);
    expect(getPlainText(quote.children[0])).toBe("hello");
    expect(getPlainText(quote.children[1])).toBe(" world");
    const merged = mergeBlockWithPrevious({ blockId: quote.children[1].id })(split.value.document, ctx());
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    const mergedQuote = merged.value.document.content[0];
    expect(mergedQuote.type).toBe("blockquote");
    if (mergedQuote.type === "blockquote") {
      expect(mergedQuote.children).toHaveLength(1);
      expect(getPlainText(mergedQuote.children[0])).toBe("hello world");
    }
    expect(validateDocument(merged.value.document).ok).toBe(true);
  });
});

describe("setParagraphStyle", () => {
  it("stores spacing and line-height in the engine document and rejects invalid values", () => {
    const { document, blockId } = setup("Paragraph");
    const styled = setParagraphStyle({ blockId, spacingBefore: 6, spacingAfter: 12, lineSpacing: 1.5, backgroundColor: "#fff2a8", borderColor: "#6475ff", borderWidth: 0.75, padding: 4.5, firstLineIndent: 18, hangingIndent: 12 })(document, ctx());
    expect(styled.ok).toBe(true);
    if (styled.ok) {
      const paragraph = styled.value.document.content[0] as Paragraph;
      expect(paragraph.spacingBefore).toBe(6);
      expect(paragraph.spacingAfter).toBe(12);
      expect(paragraph.lineSpacing).toBe(1.5);
      expect(paragraph.backgroundColor).toBe("#fff2a8");
      expect(paragraph.borderColor).toBe("#6475ff");
      expect(paragraph.borderWidth).toBe(0.75);
      expect(paragraph.padding).toBe(4.5);
      expect(paragraph.firstLineIndent).toBe(18);
      expect(paragraph.hangingIndent).toBe(12);
      const inserted = insertParagraphAfter({ blockId })(styled.value.document, ctx());
      expect(inserted.ok).toBe(true);
      if (inserted.ok) {
        const nextParagraph = inserted.value.document.content[1] as Paragraph;
        expect(nextParagraph.backgroundColor).toBe("#fff2a8");
        expect(nextParagraph.borderColor).toBe("#6475ff");
        expect(nextParagraph.lineSpacing).toBe(1.5);
      }
    }
    const invalid = setParagraphStyle({ blockId, lineSpacing: 9 })(document, ctx());
    expect(invalid.ok).toBe(false);
  });
});

describe("setAlign / setHeadingLevel", () => {
  it("sets paragraph alignment", () => {
    const { document, blockId } = setup("Hello");
    const result = setAlign({ blockId, align: "center" })(document, ctx());
    expect(result.ok).toBe(true);
    if (result.ok) expect((result.value.document.content[0] as Paragraph).align).toBe("center");
  });

  it("sets indentation and rejects out-of-range values", () => {
    const { document, blockId } = setup("Indented");
    const result = setIndent({ blockId, indent: 36 })(document, ctx());
    expect(result.ok).toBe(true);
    if (result.ok) expect((result.value.document.content[0] as Paragraph).indent).toBe(36);
    const invalid = setIndent({ blockId, indent: 900 })(document, ctx());
    expect(invalid.ok).toBe(false);
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

  it("converts and deletes blockquotes inside table cells without breaking the cell", () => {
    const { document: d } = setup("start");
    const initial = d.content[0] as Paragraph;
    const inserted = insertTable({ afterBlockId: initial.id, rows: 1, columns: 1 })(d, ctx());
    if (!inserted.ok) throw inserted.error;
    const table = inserted.value.document.content.find(block => block.type === "table");
    if (!table || table.type !== "table") throw new Error("Expected table");
    const cell = table.children[0]!.children[0]!;
    const paragraph = cell.children[0];
    if (!paragraph || paragraph.type !== "paragraph") throw new Error("Expected cell paragraph");
    const quoted = convertBlockToBlockquote({ blockId: paragraph.id })(inserted.value.document, ctx());
    if (!quoted.ok) throw quoted.error;
    const quotedTable = quoted.value.document.content.find(block => block.type === "table");
    if (!quotedTable || quotedTable.type !== "table") throw new Error("Expected quoted table");
    const quote = quotedTable.children[0]!.children[0]!.children[0];
    expect(quote?.type).toBe("blockquote");
    expect(validateDocument(quoted.value.document).ok).toBe(true);
    if (!quote) throw new Error("Expected blockquote");
    const deleted = deleteBlock({ blockId: quote.id })(quoted.value.document, ctx());
    if (!deleted.ok) throw deleted.error;
    const deletedTable = deleted.value.document.content.find(block => block.type === "table");
    if (!deletedTable || deletedTable.type !== "table") throw new Error("Expected table after nested delete");
    expect(deletedTable.children[0]!.children[0]!.children).toHaveLength(1);
    expect(deletedTable.children[0]!.children[0]!.children[0]?.type).toBe("paragraph");
    expect(validateDocument(deleted.value.document).ok).toBe(true);
  });


  it("splits and merges text paragraphs nested inside a cell list", () => {
    const { document: d } = setup("start");
    const initial = d.content[0] as Paragraph;
    const inserted = insertTable({ afterBlockId: initial.id, rows: 1, columns: 1 })(d, ctx());
    if (!inserted.ok) throw inserted.error;
    const table = inserted.value.document.content.find(block => block.type === "table");
    if (!table || table.type !== "table") throw new Error("Expected table");
    const row = table.children[0]!;
    const cell = row.children[0]!;
    const nestedId = createIdGenerator("nested", 23);
    const nestedParagraph: Extract<Block, { type: "paragraph" }> = {
      type: "paragraph",
      id: nestedId(),
      children: [{ type: "text", id: nestedId(), text: "Nested text", marks: [] }],
    };
    const list: Extract<Block, { type: "bulletList" }> = {
      type: "bulletList",
      id: nestedId(),
      children: [{ type: "listItem", id: nestedId(), children: [nestedParagraph] }],
    };
    const withList = {
      ...inserted.value.document,
      content: inserted.value.document.content.map(block => block.id === table.id ? {
        ...table,
        children: table.children.map(itemRow => itemRow.id === row.id ? {
          ...itemRow,
          children: itemRow.children.map(itemCell => itemCell.id === cell.id ? { ...itemCell, children: [list] } : itemCell),
        } : itemRow),
      } : block),
    };
    const split = splitBlock({ blockId: nestedParagraph.id, offset: 6 })(withList, ctx());
    if (!split.ok) throw split.error;
    const splitTable = split.value.document.content.find(block => block.type === "table");
    if (!splitTable || splitTable.type !== "table") throw new Error("Expected table after split");
    const splitList = splitTable.children[0]!.children[0]!.children[0];
    if (!splitList || splitList.type !== "bulletList") throw new Error("Expected nested list after split");
    expect(splitList.children[0]!.children).toHaveLength(2);
    expect(validateDocument(split.value.document).ok).toBe(true);
    const merge = mergeBlockWithPrevious({ blockId: split.value.selection!.blockId })(split.value.document, ctx());
    if (!merge.ok) throw merge.error;
    const mergedTable = merge.value.document.content.find(block => block.type === "table");
    if (!mergedTable || mergedTable.type !== "table") throw new Error("Expected table after merge");
    const mergedList = mergedTable.children[0]!.children[0]!.children[0];
    if (!mergedList || mergedList.type !== "bulletList") throw new Error("Expected nested list after merge");
    const mergedParagraph = mergedList.children[0]!.children[0];
    if (!mergedParagraph || mergedParagraph.type !== "paragraph") throw new Error("Expected merged paragraph");
    expect(getPlainText(mergedParagraph)).toBe("Nested text");
    expect(validateDocument(merge.value.document).ok).toBe(true);
  });


  it("applies heading levels to paragraphs nested directly in table cells", () => {
    const { document: d } = setup("start");
    const initial = d.content[0] as Paragraph;
    const inserted = insertTable({ afterBlockId: initial.id, rows: 1, columns: 1 })(d, ctx());
    if (!inserted.ok) throw inserted.error;
    const table = inserted.value.document.content.find(block => block.type === "table");
    if (!table || table.type !== "table") throw new Error("Expected table");
    const paragraph = table.children[0]!.children[0]!.children[0];
    if (!paragraph || paragraph.type !== "paragraph") throw new Error("Expected cell paragraph");
    const changed = setHeadingLevel({ blockId: paragraph.id, level: 2 })(inserted.value.document, ctx());
    if (!changed.ok) throw changed.error;
    const changedTable = changed.value.document.content.find(block => block.type === "table");
    if (!changedTable || changedTable.type !== "table") throw new Error("Expected changed table");
    expect(changedTable.children[0]!.children[0]!.children[0]?.type).toBe("heading");
    expect(validateDocument(changed.value.document).ok).toBe(true);
  });

});

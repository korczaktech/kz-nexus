import { describe, expect, it } from "vitest";
import { createIdGenerator } from "../core/ids";
import { createFixedClock } from "../core/clock";
import { createDocument } from "./document";
import { addTableColumn, addTableRow, insertTable, insertTableCellImageResource, removeTableColumn, removeTableRow, replaceTableCellContent, insertTableCellBlocksAfterParagraph, insertTableIntoCell, setCellText } from "./table";
import { getPlainText } from "../model/tree";
import type { Block, Paragraph, Table, TableCell } from "../model/types";
import { validateDocument } from "../validation/validate";
import { exportHtml } from "../exporters/html";
import { exportMarkdown } from "../exporters/markdown";

function paragraphAt(cell: TableCell, index = 0): Paragraph {
  const child = cell.children[index];
  if (!child || child.type !== "paragraph") throw new Error("Expected paragraph in table cell");
  return child;
}

function ctx() {
  return { generateId: createIdGenerator("id", 5) };
}

function base() {
  return createDocument(createIdGenerator("n", 1), createFixedClock(0).now);
}

describe("insertTable", () => {
  it("creates a table with the requested dimensions", () => {
    const d = base();
    const result = insertTable({ afterBlockId: d.content[0].id, rows: 2, columns: 3 })(d, ctx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const table = result.value.document.content[1] as Table;
      expect(table.children).toHaveLength(2);
      expect(table.children[0].children).toHaveLength(3);
    }
  });

  it("rejects invalid dimensions", () => {
    const d = base();
    const result = insertTable({ afterBlockId: d.content[0].id, rows: 0, columns: 3 })(d, ctx());
    expect(result.ok).toBe(false);
  });
});

describe("row/column operations", () => {
  function tableDoc() {
    const d = base();
    const result = insertTable({ afterBlockId: d.content[0].id, rows: 2, columns: 2 })(d, ctx());
    if (!result.ok) throw result.error;
    return { document: result.value.document, tableId: result.value.document.content[1].id };
  }

  it("adds a row", () => {
    const { document, tableId } = tableDoc();
    const result = addTableRow({ tableId })(document, ctx());
    if (!result.ok) throw result.error;
    expect((result.value.document.content[1] as Table).children).toHaveLength(3);
  });

  it("inserts a row immediately after the requested row", () => {
    const { document, tableId } = tableDoc();
    const original = document.content[1] as Table;
    const result = addTableRow({ tableId, afterRowId: original.children[0].id })(document, ctx());
    if (!result.ok) throw result.error;
    const rows = (result.value.document.content[1] as Table).children;
    expect(rows[0].id).toBe(original.children[0].id);
    expect(rows[2].id).toBe(original.children[1].id);
    expect(rows[1].id).not.toBe(original.children[0].id);
    expect(rows[1].id).not.toBe(original.children[1].id);
  });

  it("rejects an unknown insertion row instead of silently inserting at the beginning", () => {
    const { document, tableId } = tableDoc();
    const result = addTableRow({ tableId, afterRowId: "missing-row" })(document, ctx());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NODE_NOT_FOUND");
  });

  it("removes a row but refuses to remove the last one", () => {
    const { document, tableId } = tableDoc();
    const table = document.content[1] as Table;
    const removed = removeTableRow({ tableId, rowId: table.children[0].id })(document, ctx());
    if (!removed.ok) throw removed.error;
    const updated = removed.value.document.content[1] as Table;
    expect(updated.children).toHaveLength(1);

    const removedLast = removeTableRow({ tableId, rowId: updated.children[0].id })(removed.value.document, ctx());
    expect(removedLast.ok).toBe(false);
  });

  it("adds and removes a column consistently across all rows", () => {
    const { document, tableId } = tableDoc();
    const added = addTableColumn({ tableId })(document, ctx());
    if (!added.ok) throw added.error;
    const afterAdd = added.value.document.content[1] as Table;
    expect(afterAdd.children.every((row) => row.children.length === 3)).toBe(true);

    const removed = removeTableColumn({ tableId, columnIndex: 0 })(added.value.document, ctx());
    if (!removed.ok) throw removed.error;
    const afterRemove = removed.value.document.content[1] as Table;
    expect(afterRemove.children.every((row) => row.children.length === 2)).toBe(true);
  });

  it("refuses to remove the last column", () => {
    const d = base();
    const created = insertTable({ afterBlockId: d.content[0].id, rows: 1, columns: 1 })(d, ctx());
    if (!created.ok) throw created.error;
    const tableId = created.value.document.content[1].id;
    const result = removeTableColumn({ tableId, columnIndex: 0 })(created.value.document, ctx());
    expect(result.ok).toBe(false);
  });

  it("inserts an image resource into a table cell", () => {
    const { document, tableId } = tableDoc();
    const table = document.content.find(block => block.type === "table" && block.id === tableId);
    if (!table || table.type !== "table") throw new Error("Expected table");
    const row = table.children[0];
    const cell = row.children[0];
    const result = insertTableCellImageResource({
      tableId, rowId: row.id, cellId: cell.id,
      mimeType: "image/png", data: "aGVsbG8=", alt: "Embedded image", name: "cell.png", width: 120, height: 96,
    })(document, ctx());
    if (!result.ok) throw result.error;
    const updated = result.value.document.content.find(block => block.type === "table" && block.id === tableId);
    if (!updated || updated.type !== "table") throw new Error("Expected updated table");
    expect(updated.children[0].children[0].images).toHaveLength(1);
    expect(updated.children[0].children[0].images?.[0]?.alt).toBe("Embedded image");
    expect(result.value.document.resources).toHaveLength(1);
    expect(result.value.document.resources[0].name).toBe("cell.png");
  });

  it("sets cell text", () => {
    const { document, tableId } = tableDoc();
    const table = document.content[1] as Table;
    const row = table.children[0];
    const cell = row.children[0];
    const result = setCellText({ tableId, rowId: row.id, cellId: cell.id, text: "Hello cell" })(document, ctx());
    if (!result.ok) throw result.error;
    const updatedTable = result.value.document.content[1] as Table;
    expect(getPlainText(paragraphAt(updatedTable.children[0].children[0], 0))).toBe("Hello cell");
  });

  it("preserves existing inline marks and inherits marks at the edit point", () => {
    const { document, tableId } = tableDoc();
    const table = document.content[1] as Table;
    const row = table.children[0];
    const cell = row.children[0];
    const originalParagraph = paragraphAt(cell, 0);
    const paragraph = {
      ...originalParagraph,
      children: [
        { ...originalParagraph.children[0], text: "Hello ", marks: [{ type: "bold" as const }] },
        { type: "text" as const, id: "normal-run-test", text: "world", marks: [] },
      ],
    };
    const seededCell = { ...cell, children: [paragraph] };
    const seededRow = { ...row, children: [seededCell, ...row.children.slice(1)] };
    const seededTable = { ...table, children: [seededRow, ...table.children.slice(1)] };
    const seededDocument = {
      ...document,
      content: document.content.map(block => block.id === tableId ? seededTable : block),
    };
    const result = setCellText({ tableId, rowId: row.id, cellId: cell.id, text: "Hello brave world" })(seededDocument, ctx());
    if (!result.ok) throw result.error;
    const updatedCell = (result.value.document.content[1] as Table).children[0].children[0];
    expect(paragraphAt(updatedCell, 0).children.map(run => run.text)).toEqual(["Hello brave ", "world"]);
    expect(paragraphAt(updatedCell, 0).children[0].marks).toEqual([{ type: "bold" }]);
    expect(paragraphAt(updatedCell, 0).children[1].marks).toEqual([]);
  });

  it("applies explicit insertion marks to newly typed text in an empty cell", () => {
    const { document, tableId } = tableDoc();
    const table = document.content[1] as Table;
    const row = table.children[0];
    const cell = row.children[0];
    const result = setCellText({
      tableId,
      rowId: row.id,
      cellId: cell.id,
      text: "bold text",
      insertionMarks: [{ type: "bold" }],
    })(document, ctx());
    if (!result.ok) throw result.error;
    const updatedCell = (result.value.document.content[1] as Table).children[0].children[0];
    expect(getPlainText(paragraphAt(updatedCell, 0))).toBe("bold text");
    expect(paragraphAt(updatedCell, 0).children).toHaveLength(1);
    expect(paragraphAt(updatedCell, 0).children[0].marks).toEqual([{ type: "bold" }]);
  });

  it("uses explicit insertion marks only for changed text and preserves unchanged suffix marks", () => {
    const { document, tableId } = tableDoc();
    const table = document.content[1] as Table;
    const row = table.children[0];
    const cell = row.children[0];
    const paragraph = {
      ...paragraphAt(cell, 0),
      children: [
        { ...paragraphAt(cell, 0).children[0], text: "old ", marks: [] },
        { type: "text" as const, id: "italic-suffix-test", text: "suffix", marks: [{ type: "italic" as const }] },
      ],
    };
    const seededCell = { ...cell, children: [paragraph] };
    const seededRow = { ...row, children: [seededCell, ...row.children.slice(1)] };
    const seededTable = { ...table, children: [seededRow, ...table.children.slice(1)] };
    const seededDocument = {
      ...document,
      content: document.content.map(block => block.id === tableId ? seededTable : block),
    };
    const result = setCellText({
      tableId,
      rowId: row.id,
      cellId: cell.id,
      text: "new suffix",
      insertionMarks: [{ type: "bold" }],
    })(seededDocument, ctx());
    if (!result.ok) throw result.error;
    const updatedCell = (result.value.document.content[1] as Table).children[0].children[0];
    expect(paragraphAt(updatedCell, 0).children.map(run => run.text).join("")).toBe("new suffix");
    expect(paragraphAt(updatedCell, 0).children.filter(run => run.text.trim() !== "").map(run => run.marks)).toEqual([[{ type: "bold" }], [{ type: "italic" }]]);
    expect(paragraphAt(updatedCell, 0).children.filter(run => run.text === " ").every(run => run.marks.length === 0)).toBe(true);
  });

  it("rejects rich insertion runs that do not match their explicit range", () => {
    const { document, tableId } = tableDoc();
    const table = document.content[1] as Table;
    const row = table.children[0];
    const cell = row.children[0];
    const result = setCellText({
      tableId,
      rowId: row.id,
      cellId: cell.id,
      text: "text",
      insertionRange: { start: 0, end: 4 },
      insertionRuns: [{ text: "different", marks: [{ type: "bold" }] }],
    })(document, ctx());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_DOCUMENT");
  });

  it("rejects invalid rich insertion ranges", () => {
    const { document, tableId } = tableDoc();
    const table = document.content[1] as Table;
    const row = table.children[0];
    const cell = row.children[0];
    const result = setCellText({
      tableId,
      rowId: row.id,
      cellId: cell.id,
      text: "text",
      insertionRange: { start: -1, end: 2 },
      insertionRuns: [{ text: "te", marks: [] }],
    })(document, ctx());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_POSITION");
  });

  it("requires an explicit range for rich insertion runs", () => {
    const { document, tableId } = tableDoc();
    const table = document.content[1] as Table;
    const row = table.children[0];
    const cell = row.children[0];
    const result = setCellText({
      tableId,
      rowId: row.id,
      cellId: cell.id,
      text: "text",
      insertionRuns: [{ text: "text", marks: [] }],
    })(document, ctx());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_DOCUMENT");
  });

  it("preserves suffix formatting when deleting text and keeps paragraph attributes", () => {
    const { document, tableId } = tableDoc();
    const table = document.content[1] as Table;
    const row = table.children[0];
    const cell = row.children[0];
    const paragraph = {
      ...paragraphAt(cell, 0),
      align: "center" as const,
      children: [
        { ...paragraphAt(cell, 0).children[0], text: "remove ", marks: [{ type: "bold" as const }] },
        { type: "text" as const, id: "suffix-run-test", text: "keep", marks: [{ type: "italic" as const }] },
      ],
    };
    const seededCell = { ...cell, children: [paragraph] };
    const seededRow = { ...row, children: [seededCell, ...row.children.slice(1)] };
    const seededTable = { ...table, children: [seededRow, ...table.children.slice(1)] };
    const seededDocument = {
      ...document,
      content: document.content.map(block => block.id === tableId ? seededTable : block),
    };

    const result = setCellText({ tableId, rowId: row.id, cellId: cell.id, text: "keep" })(seededDocument, ctx());
    if (!result.ok) throw result.error;
    const updatedParagraph = paragraphAt((result.value.document.content[1] as Table).children[0].children[0], 0);
    expect(updatedParagraph.align).toBe("center");
    expect(updatedParagraph.children.map(run => run.text)).toEqual(["keep"]);
    expect(updatedParagraph.children[0].marks).toEqual([{ type: "italic" }]);
  });

  it("preserves empty paragraphs when cell text contains consecutive newlines", () => {
    const { document, tableId } = tableDoc();
    const table = document.content[1] as Table;
    const row = table.children[0];
    const cell = row.children[0];
    const result = setCellText({ tableId, rowId: row.id, cellId: cell.id, text: "first\n\nthird" })(document, ctx());
    if (!result.ok) throw result.error;
    const updatedCell = (result.value.document.content[1] as Table).children[0].children[0];
    expect(updatedCell.children).toHaveLength(3);
    expect(updatedCell.children.map(child => { if (child.type !== "paragraph") throw new Error("Expected paragraph"); return getPlainText(child); })).toEqual(["first", "", "third"]);
  });

  it("preserves newline-separated cell text as separate paragraphs", () => {
    const { document, tableId } = tableDoc();
    const table = document.content[1] as Table;
    const row = table.children[0];
    const cell = row.children[0];
    const result = setCellText({ tableId, rowId: row.id, cellId: cell.id, text: "first line\nsecond line" })(document, ctx());
    if (!result.ok) throw result.error;
    const updatedCell = (result.value.document.content[1] as Table).children[0].children[0];
    expect(updatedCell.children).toHaveLength(2);
    expect(getPlainText(paragraphAt(updatedCell, 0))).toBe("first line");
    expect(getPlainText(paragraphAt(updatedCell, 1))).toBe("second line");
    expect(paragraphAt(updatedCell, 0).id).toBe(paragraphAt(cell, 0).id);
  });

  it("preserves nested lists and tables in cells through validation, export, and table commands", () => {
    const document = base();
    const context = ctx();
    const initial = document.content[0];
    if (!initial || initial.type !== "paragraph") throw new Error("Expected initial paragraph");
    const inserted = insertTable({ afterBlockId: initial.id, rows: 1, columns: 1 })(document, context);
    if (!inserted.ok) throw inserted.error;
    const outer = inserted.value.document.content.find(block => block.type === "table");
    if (!outer || outer.type !== "table") throw new Error("Expected outer table");
    const blocks: Block[] = [
      { type: "bulletList", id: "pasted-list", children: [
        { type: "listItem", id: "pasted-item", children: [
          { type: "paragraph", id: "pasted-paragraph", children: [{ type: "text", id: "pasted-run", text: "Nested list", marks: [] }] },
        ] },
      ] },
      { type: "table", id: "pasted-table", children: [
        { type: "tableRow", id: "pasted-row", children: [
          { type: "tableCell", id: "pasted-cell", children: [
            { type: "paragraph", id: "pasted-cell-paragraph", children: [{ type: "text", id: "pasted-cell-run", text: "Nested table", marks: [] }] },
          ] },
        ] },
      ] },
    ];
    const replaced = replaceTableCellContent({
      tableId: outer.id,
      rowId: outer.children[0]!.id,
      cellId: outer.children[0]!.children[0]!.id,
      blocks,
    })(inserted.value.document, context);
    if (!replaced.ok) throw replaced.error;
    const updatedOuter = replaced.value.document.content.find(block => block.type === "table");
    if (!updatedOuter || updatedOuter.type !== "table") throw new Error("Expected updated outer table");
    const cell = updatedOuter.children[0]!.children[0]!;
    expect(cell.children.map(block => block.type)).toEqual(["bulletList", "table"]);
    expect(validateDocument(replaced.value.document).ok).toBe(true);
    const html = exportHtml(replaced.value.document);
    expect(html).toContain("<ul>");
    expect(html).toContain("<table>");
    expect(html).toContain("Nested list");
    expect(html).toContain("Nested table");
    const markdown = exportMarkdown(replaced.value.document);
    expect(markdown).toContain("<ul>");
    expect(markdown).toContain("<table>");
    expect(markdown).toContain("Nested table");

    const nestedTable = cell.children.find(block => block.type === "table");
    if (!nestedTable || nestedTable.type !== "table") throw new Error("Expected nested table");
    const addRow = addTableRow({ tableId: nestedTable.id })(replaced.value.document, context);
    if (!addRow.ok) throw addRow.error;
    const updatedNested = (addRow.value.document.content.find(block => block.type === "table") as Table)
      .children[0]!.children[0]!.children.find(block => block.type === "table");
    if (!updatedNested || updatedNested.type !== "table") throw new Error("Nested table command did not find nested table");
    expect(updatedNested.children).toHaveLength(2);
    expect(validateDocument(addRow.value.document).ok).toBe(true);
  });


  it("inserts nested blocks at a selected cell paragraph without replacing adjacent content", () => {
    const { document, tableId } = tableDoc();
    const context = { generateId: createIdGenerator("nested", 5) };
    const table = document.content.find(block => block.type === "table") as Table;
    const row = table.children[0]!;
    const cell = row.children[0]!;
    const paragraph = paragraphAt(cell, 0);
    const inserted = insertTableCellBlocksAfterParagraph({
      tableId,
      rowId: row.id,
      cellId: cell.id,
      afterBlockId: paragraph.id,
      blocks: [{
        type: "bulletList",
        id: "list-to-insert",
        children: [{
          type: "listItem",
          id: "list-item-to-insert",
          children: [{ type: "paragraph", id: "list-paragraph-to-insert", children: [{ type: "text", id: "list-run-to-insert", text: "Inserted list", marks: [] }] }],
        }],
      }],
    })(document, context);
    if (!inserted.ok) throw inserted.error;
    const updatedTable = inserted.value.document.content.find(block => block.type === "table") as Table;
    const updatedCell = updatedTable.children[0]!.children[0]!;
    expect(updatedCell.children.map(block => block.type)).toEqual(["paragraph", "bulletList"]);
    expect(getPlainText(updatedCell.children[1]!)).toContain("Inserted list");
    expect(validateDocument(inserted.value.document).ok).toBe(true);
  });


  it("inserts a nested table through the table-cell command", () => {
    const { document, tableId } = tableDoc();
    const table = document.content.find(block => block.type === "table") as Table;
    const row = table.children[0]!;
    const cell = row.children[0]!;
    const result = insertTableIntoCell({
      tableId,
      rowId: row.id,
      cellId: cell.id,
      afterBlockId: paragraphAt(cell, 0).id,
      rows: 2,
      columns: 2,
    })(document, { generateId: createIdGenerator("nested", 17) });
    if (!result.ok) throw result.error;
    const updatedTable = result.value.document.content.find(block => block.type === "table") as Table;
    const updatedCell = updatedTable.children[0]!.children[0]!;
    const nestedTable = updatedCell.children.find(block => block.type === "table");
    expect(nestedTable?.type).toBe("table");
    if (!nestedTable || nestedTable.type !== "table") throw new Error("Expected nested table");
    expect(nestedTable.children).toHaveLength(2);
    expect(nestedTable.children[0]!.children).toHaveLength(2);
    expect(validateDocument(result.value.document).ok).toBe(true);
  });

});

import { describe, expect, it } from "vitest";
import { createIdGenerator } from "../core/ids";
import { createFixedClock } from "../core/clock";
import { createDocument } from "./document";
import { addTableColumn, addTableRow, insertTable, removeTableColumn, removeTableRow, setCellText } from "./table";
import { getPlainText } from "../model/tree";
import type { Table } from "../model/types";

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

  it("sets cell text", () => {
    const { document, tableId } = tableDoc();
    const table = document.content[1] as Table;
    const row = table.children[0];
    const cell = row.children[0];
    const result = setCellText({ tableId, rowId: row.id, cellId: cell.id, text: "Hello cell" })(document, ctx());
    if (!result.ok) throw result.error;
    const updatedTable = result.value.document.content[1] as Table;
    expect(getPlainText(updatedTable.children[0].children[0].children[0])).toBe("Hello cell");
  });

  it("preserves existing inline marks and inherits marks at the edit point", () => {
    const { document, tableId } = tableDoc();
    const table = document.content[1] as Table;
    const row = table.children[0];
    const cell = row.children[0];
    const originalParagraph = cell.children[0];
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
    expect(updatedCell.children[0].children.map(run => run.text)).toEqual(["Hello brave ", "world"]);
    expect(updatedCell.children[0].children[0].marks).toEqual([{ type: "bold" }]);
    expect(updatedCell.children[0].children[1].marks).toEqual([]);
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
    expect(getPlainText(updatedCell.children[0])).toBe("bold text");
    expect(updatedCell.children[0].children).toHaveLength(1);
    expect(updatedCell.children[0].children[0].marks).toEqual([{ type: "bold" }]);
  });

  it("uses explicit insertion marks only for changed text and preserves unchanged suffix marks", () => {
    const { document, tableId } = tableDoc();
    const table = document.content[1] as Table;
    const row = table.children[0];
    const cell = row.children[0];
    const paragraph = {
      ...cell.children[0],
      children: [
        { ...cell.children[0].children[0], text: "old ", marks: [] },
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
    expect(updatedCell.children[0].children.map(run => run.text)).toEqual(["new ", "suffix"]);
    expect(updatedCell.children[0].children[0].marks).toEqual([{ type: "bold" }]);
    expect(updatedCell.children[0].children[1].marks).toEqual([{ type: "italic" }]);
  });

  it("preserves suffix formatting when deleting text and keeps paragraph attributes", () => {
    const { document, tableId } = tableDoc();
    const table = document.content[1] as Table;
    const row = table.children[0];
    const cell = row.children[0];
    const paragraph = {
      ...cell.children[0],
      align: "center" as const,
      children: [
        { ...cell.children[0].children[0], text: "remove ", marks: [{ type: "bold" as const }] },
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
    const updatedParagraph = (result.value.document.content[1] as Table).children[0].children[0].children[0];
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
    expect(updatedCell.children.map(paragraph => getPlainText(paragraph))).toEqual(["first", "", "third"]);
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
    expect(getPlainText(updatedCell.children[0] as never)).toBe("first line");
    expect(getPlainText(updatedCell.children[1] as never)).toBe("second line");
    expect(updatedCell.children[0].id).toBe(cell.children[0].id);
  });
});

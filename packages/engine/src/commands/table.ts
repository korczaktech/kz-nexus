import type { Block, Paragraph, Table, TableCell, TableRow } from "../model/types";
import { EngineError, engineError } from "../errors/errors";
import { err, ok } from "../utils/result";
import type { Command } from "./types";

function makeEmptyParagraph(generateId: () => string): Paragraph {
  return { type: "paragraph", id: generateId(), children: [{ type: "text", id: generateId(), text: "", marks: [] }] };
}

function makeCell(generateId: () => string): TableCell {
  return { type: "tableCell", id: generateId(), children: [makeEmptyParagraph(generateId)] };
}

function makeRow(generateId: () => string, columns: number): TableRow {
  return { type: "tableRow", id: generateId(), children: Array.from({ length: columns }, () => makeCell(generateId)) };
}

function findTableIndex(blocks: Block[], tableId: string): number {
  return blocks.findIndex((block) => block.type === "table" && block.id === tableId);
}

export function insertTable(params: { afterBlockId: string; rows: number; columns: number }): Command {
  return (doc, ctx) => {
    if (params.rows < 1 || params.columns < 1) {
      return err(engineError("INVALID_DOCUMENT", "Table must have at least 1 row and 1 column"));
    }
    const index = doc.content.findIndex((block) => block.id === params.afterBlockId);
    if (index === -1) return err(engineError("NODE_NOT_FOUND", `Top-level block "${params.afterBlockId}" not found`, { path: params.afterBlockId }));
    const table: Table = {
      type: "table",
      id: ctx.generateId(),
      children: Array.from({ length: params.rows }, () => makeRow(ctx.generateId, params.columns)),
    };
    const content = [...doc.content];
    content.splice(index + 1, 0, table);
    return ok({ document: { ...doc, content } });
  };
}

function withTable(doc: Parameters<Command>[0], tableId: string, transform: (table: Table) => Table): ReturnType<Command> {
  const index = findTableIndex(doc.content, tableId);
  if (index === -1) return err(engineError("NODE_NOT_FOUND", `Table "${tableId}" not found`, { path: tableId }));
  try {
    const content = [...doc.content];
    content[index] = transform(doc.content[index] as Table);
    return ok({ document: { ...doc, content } });
  } catch (error) {
    if (error instanceof EngineError) return err(error);
    throw error;
  }
}

export function addTableRow(params: { tableId: string; afterRowId?: string }): Command {
  return (doc, ctx) =>
    withTable(doc, params.tableId, (table) => {
      const columns = table.children[0]?.children.length ?? 1;
      const newRow = makeRow(ctx.generateId, columns);
      const index = params.afterRowId ? table.children.findIndex((row) => row.id === params.afterRowId) : table.children.length - 1;
      const children = [...table.children];
      children.splice(index + 1, 0, newRow);
      return { ...table, children };
    });
}

export function removeTableRow(params: { tableId: string; rowId: string }): Command {
  return (doc) =>
    withTable(doc, params.tableId, (table) => {
      if (table.children.length <= 1) throw engineError("UNSUPPORTED_OPERATION", "Cannot remove the last row of a table", { path: params.tableId });
      return { ...table, children: table.children.filter((row) => row.id !== params.rowId) };
    });
}

export function addTableColumn(params: { tableId: string; afterColumnIndex?: number }): Command {
  return (doc, ctx) =>
    withTable(doc, params.tableId, (table) => ({
      ...table,
      children: table.children.map((row) => {
        const index = params.afterColumnIndex ?? row.children.length - 1;
        const cells = [...row.children];
        cells.splice(index + 1, 0, makeCell(ctx.generateId));
        return { ...row, children: cells };
      }),
    }));
}

export function removeTableColumn(params: { tableId: string; columnIndex: number }): Command {
  return (doc) =>
    withTable(doc, params.tableId, (table) => {
      const columnCount = table.children[0]?.children.length ?? 0;
      if (columnCount <= 1) throw engineError("UNSUPPORTED_OPERATION", "Cannot remove the last column of a table", { path: params.tableId });
      return { ...table, children: table.children.map((row) => ({ ...row, children: row.children.filter((_, i) => i !== params.columnIndex) })) };
    });
}

export function setCellText(params: { tableId: string; rowId: string; cellId: string; text: string }): Command {
  return (doc, ctx) =>
    withTable(doc, params.tableId, (table) => ({
      ...table,
      children: table.children.map((row) =>
        row.id !== params.rowId
          ? row
          : {
              ...row,
              children: row.children.map((cell) =>
                cell.id !== params.cellId
                  ? cell
                  : { ...cell, children: [{ type: "paragraph", id: cell.children[0]?.id ?? ctx.generateId(), children: [{ type: "text", id: ctx.generateId(), text: params.text, marks: [] }] }] },
              ),
            },
      ),
    }));
}

import type { Block, ImageBlock, Mark, Paragraph, Table, TableCell, TableRow, TextRun } from "../model/types";
import { EngineError, engineError } from "../errors/errors";
import { err, ok } from "../utils/result";
import type { Command } from "./types";
import { addResource } from "../resources/resources";

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

/** Adds an image resource to a table cell as a first-class part of the canonical document. */
export function insertTableCellImageResource(params: {
  tableId: string;
  rowId: string;
  cellId: string;
  mimeType: string;
  data: string;
  alt: string;
  name?: string;
  width?: number;
  height?: number;
}): Command {
  return (doc, ctx) => {
    const cellExists = doc.content.some(block => block.type === "table" && block.id === params.tableId
      && block.children.some(row => row.id === params.rowId && row.children.some(cell => cell.id === params.cellId)));
    if (!cellExists) return err(engineError("NODE_NOT_FOUND", "Target table cell was not found", { path: params.cellId }));
    const added = addResource(doc, { kind: "image", mimeType: params.mimeType, data: params.data, name: params.name }, ctx.generateId);
    if (!added.ok) return added;
    const image: ImageBlock = { type: "image", id: ctx.generateId(), resourceId: added.value.resource.id, alt: params.alt, width: params.width, height: params.height };
    return withTable(added.value.document, params.tableId, table => ({
      ...table,
      children: table.children.map(row => row.id !== params.rowId ? row : ({
        ...row,
        children: row.children.map(cell => cell.id !== params.cellId ? cell : ({ ...cell, images: [...(cell.images ?? []), image] }))
      }))
    }));
  };
}

export function addTableRow(params: { tableId: string; afterRowId?: string }): Command {
  return (doc, ctx) =>
    withTable(doc, params.tableId, (table) => {
      const columns = table.children[0]?.children.length ?? 1;
      const newRow = makeRow(ctx.generateId, columns);
      const index = params.afterRowId ? table.children.findIndex((row) => row.id === params.afterRowId) : table.children.length - 1;
      if (params.afterRowId && index < 0) {
        throw engineError("NODE_NOT_FOUND", `Row "${params.afterRowId}" not found in table "${params.tableId}"`, { path: params.afterRowId });
      }
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

function sameMarks(a: Mark[], b: Mark[]): boolean {
  if (a.length !== b.length) return false;
  const key = (mark: Mark): string => "value" in mark ? mark.type + ":" + String(mark.value) : mark.type;
  const left = a.map(key).sort();
  const right = b.map(key).sort();
  return left.every((value, index) => value === right[index]);
}

/**
 * Rebuilds cell paragraphs while preserving marks outside the single edited
 * range. The cell controller submits the full text after each edit, so a
 * common-prefix/suffix diff identifies the inserted/replaced range.
 */
type CellInsertionRun = { text: string; marks: Mark[] };

function rebuildCellParagraphs(
  cell: TableCell,
  text: string,
  generateId: () => string,
  options: { insertionMarks?: Mark[]; insertionRuns?: CellInsertionRun[]; insertionRange?: { start: number; end: number } } = {},
): Paragraph[] {
  const oldText = cell.children.map(paragraph => paragraph.children.map(run => run.text).join("")).join("\n");
  const oldMarks: Mark[][] = [];
  for (let paragraphIndex = 0; paragraphIndex < cell.children.length; paragraphIndex += 1) {
    const paragraph = cell.children[paragraphIndex]!;
    for (const run of paragraph.children) {
      for (let offset = 0; offset < run.text.length; offset += 1) oldMarks.push(run.marks);
    }
    if (paragraphIndex < cell.children.length - 1) oldMarks.push([]);
  }

  let prefix = 0;
  while (prefix < oldText.length && prefix < text.length && oldText[prefix] === text[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < oldText.length - prefix && suffix < text.length - prefix &&
    oldText[oldText.length - suffix - 1] === text[text.length - suffix - 1]) suffix += 1;

  const changedStart = options.insertionRange?.start ?? prefix;
  const changedEnd = options.insertionRange?.end ?? text.length - suffix;
  const inheritedIndex = changedStart > 0 && oldText[changedStart - 1] !== "\n"
    ? changedStart - 1
    : changedStart < oldText.length && oldText[changedStart] !== "\n" ? changedStart : -1;
  const inheritedMarks = options.insertionMarks
    ? options.insertionMarks.map(mark => ({ ...mark }))
    : inheritedIndex >= 0 ? oldMarks[inheritedIndex] ?? [] : [];
  const marksForInsertedOffset = (offset: number): Mark[] => {
    if (options.insertionRuns) {
      let consumed = 0;
      for (const run of options.insertionRuns) {
        if (offset < consumed + run.text.length) return run.marks;
        consumed += run.text.length;
      }
      return [];
    }
    return inheritedMarks;
  };
  const marksAt = (newOffset: number): Mark[] => {
    if (newOffset < changedStart) return oldMarks[newOffset] ?? [];
    if (newOffset >= changedEnd) {
      const oldOffset = oldText.length - (text.length - newOffset);
      return oldMarks[oldOffset] ?? [];
    }
    return marksForInsertedOffset(newOffset - changedStart);
  };

  let globalOffset = 0;
  return text.split("\n").map((line, paragraphIndex) => {
    const previous = cell.children[paragraphIndex];
    const runs: TextRun[] = [];
    for (let index = 0; index < line.length; index += 1) {
      const marks = marksAt(globalOffset + index);
      const last = runs[runs.length - 1];
      if (last && sameMarks(last.marks, marks)) {
        runs[runs.length - 1] = { ...last, text: last.text + line[index] };
      } else {
        runs.push({
          type: "text",
          id: runs.length === 0 && previous?.children[0] ? previous.children[0].id : generateId(),
          text: line[index]!,
          marks: [...marks],
        });
      }
    }
    if (!runs.length) {
      runs.push({ type: "text", id: previous?.children[0]?.id ?? generateId(), text: "", marks: [] });
    }
    globalOffset += line.length + 1;
    return { ...previous, type: "paragraph" as const, id: previous?.id ?? generateId(), children: runs };
  });
}
export function setCellText(params: { tableId: string; rowId: string; cellId: string; text: string; insertionMarks?: Mark[]; insertionRuns?: CellInsertionRun[]; insertionRange?: { start: number; end: number } }): Command {
  return (doc, ctx) => {
    if (params.insertionRuns && !params.insertionRange) {
      return err(engineError("INVALID_DOCUMENT", "Rich insertion runs require an explicit insertion range"));
    }
    if (params.insertionRange) {
      const { start, end } = params.insertionRange;
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > params.text.length) {
        return err(engineError("INVALID_POSITION", "Invalid cell insertion range"));
      }
      if (params.insertionRuns && params.insertionRuns.map(run => run.text).join("") !== params.text.slice(start, end)) {
        return err(engineError("INVALID_DOCUMENT", "Rich insertion runs must match the text in the insertion range"));
      }
    }
    return withTable(doc, params.tableId, (table) => ({
      ...table,
      children: table.children.map((row) =>
        row.id !== params.rowId
          ? row
          : {
              ...row,
              children: row.children.map((cell) => {
                if (cell.id !== params.cellId) return cell;
                return { ...cell, children: rebuildCellParagraphs(cell, params.text, ctx.generateId, { insertionMarks: params.insertionMarks, insertionRuns: params.insertionRuns, insertionRange: params.insertionRange }) };
              }),
            },
      ),
    }));
  };
}

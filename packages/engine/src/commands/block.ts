import type { Alignment, Block, NexusDocument, Paragraph, TextRun } from "../model/types";
import { findParagraphLike, getPlainText, isParagraphLike, mapParagraphLike } from "../model/tree";
import { splitRunsAt } from "./text";
import { engineError } from "../errors/errors";
import { err, ok } from "../utils/result";
import type { Command } from "./types";

function findTopLevelIndex(blocks: Block[], blockId: string): number {
  return blocks.findIndex((block) => block.id === blockId);
}

export function setAlign(params: { blockId: string; align: Alignment }): Command {
  return (doc) => {
    const node = findParagraphLike(doc.content, params.blockId);
    if (!node) return err(engineError("NODE_NOT_FOUND", `Block "${params.blockId}" not found`, { path: params.blockId }));
    const content = mapParagraphLike(doc.content, (n) => (n.id === params.blockId ? { ...n, align: params.align } : n));
    return ok({ document: { ...doc, content } });
  };
}

/** Converts a top-level paragraph into a heading of `level`, or a heading back into a paragraph when `level` is "paragraph". */
export function setHeadingLevel(params: { blockId: string; level: 1 | 2 | 3 | 4 | 5 | 6 | "paragraph" }): Command {
  return (doc) => {
    const index = findTopLevelIndex(doc.content, params.blockId);
    if (index === -1) return err(engineError("NODE_NOT_FOUND", `Top-level block "${params.blockId}" not found`, { path: params.blockId }));
    const block = doc.content[index];
    if (!isParagraphLike(block)) {
      return err(engineError("UNSUPPORTED_OPERATION", `Block "${params.blockId}" cannot have a heading level`, { path: params.blockId }));
    }
    const content = [...doc.content];
    content[index] =
      params.level === "paragraph"
        ? { type: "paragraph", id: block.id, align: block.align, children: block.children }
        : { type: "heading", id: block.id, level: params.level, align: block.align, children: block.children };
    return ok({ document: { ...doc, content } });
  };
}

/** Splits the top-level paragraph/heading `blockId` at `offset` into two sibling blocks. */
export function splitBlock(params: { blockId: string; offset: number }): Command {
  return (doc, ctx) => {
    const index = findTopLevelIndex(doc.content, params.blockId);
    const ensureRun = (runs: TextRun[]): TextRun[] => (runs.length > 0 ? runs : [{ type: "text", id: ctx.generateId(), text: "", marks: [] }]);
    const splitParagraph = (block: Paragraph, containerChildren: Paragraph[], childIndex: number): { children: Paragraph[]; newId: string } => {
      const length = getPlainText(block).length;
      if (params.offset < 0 || params.offset > length) throw engineError("INVALID_POSITION", `Offset ${params.offset} out of range`, { path: params.blockId });
      const { before, after } = splitRunsAt(block.children, params.offset, ctx.generateId);
      const newId = ctx.generateId();
      const first: Paragraph = { ...block, children: ensureRun(before) };
      const second: Paragraph = { type: "paragraph", id: newId, align: block.align, children: ensureRun(after) };
      const children = [...containerChildren];
      children.splice(childIndex, 1, first, second);
      return { children, newId };
    };
    if (index >= 0) {
      const block = doc.content[index];
      if (!isParagraphLike(block)) return err(engineError("UNSUPPORTED_OPERATION", `Block "${params.blockId}" cannot be split`, { path: params.blockId }));
      const length = getPlainText(block).length;
      if (params.offset < 0 || params.offset > length) return err(engineError("INVALID_POSITION", `Offset ${params.offset} out of range`, { path: params.blockId }));
      const parts = splitRunsAt(block.children, params.offset, ctx.generateId);
      const newId = ctx.generateId();
      const first: Block = { ...block, children: ensureRun(parts.before) } as Block;
      const second: Paragraph = { type: "paragraph", id: newId, align: block.align, children: ensureRun(parts.after) };
      const content = [...doc.content];
      content.splice(index, 1, first, second);
      return ok({ document: { ...doc, content }, selection: { blockId: newId, offset: 0 } });
    }
    for (let topIndex = 0; topIndex < doc.content.length; topIndex++) {
      const top = doc.content[topIndex]!;
      if (top.type === "blockquote") {
        const childIndex = top.children.findIndex(child => child.id === params.blockId);
        if (childIndex < 0) continue;
        try {
          const split = splitParagraph(top.children[childIndex]!, top.children, childIndex);
          const content = [...doc.content];
          content[topIndex] = { ...top, children: split.children };
          return ok({ document: { ...doc, content }, selection: { blockId: split.newId, offset: 0 } });
        } catch (error) {
          return err(error instanceof Error ? engineError("INVALID_POSITION", error.message, { path: params.blockId }) : error as ReturnType<typeof engineError>);
        }
      }
      if (top.type === "table") {
        for (let rowIndex = 0; rowIndex < top.children.length; rowIndex++) {
          const row = top.children[rowIndex]!;
          for (let cellIndex = 0; cellIndex < row.children.length; cellIndex++) {
            const cell = row.children[cellIndex]!;
            const childIndex = cell.children.findIndex(child => child.id === params.blockId);
            if (childIndex < 0) continue;
            try {
              const split = splitParagraph(cell.children[childIndex]!, cell.children, childIndex);
              const rows = [...top.children];
              const cells = [...row.children];
              cells[cellIndex] = { ...cell, children: split.children };
              rows[rowIndex] = { ...row, children: cells };
              const content = [...doc.content];
              content[topIndex] = { ...top, children: rows };
              return ok({ document: { ...doc, content }, selection: { blockId: split.newId, offset: 0 } });
            } catch (error) {
              return err(error instanceof Error ? engineError("INVALID_POSITION", error.message, { path: params.blockId }) : error as ReturnType<typeof engineError>);
            }
          }
        }
      }
    }
    return err(engineError("NODE_NOT_FOUND", `Text block "${params.blockId}" not found`, { path: params.blockId }));
  };
}

/** Merges the top-level block `blockId` into its previous sibling, concatenating text content. */
export function mergeBlockWithPrevious(params: { blockId: string }): Command {
  return (doc) => {
    const index = findTopLevelIndex(doc.content, params.blockId);
    if (index > 0) {
      const current = doc.content[index];
      const previous = doc.content[index - 1];
      if (!isParagraphLike(current) || !isParagraphLike(previous)) return err(engineError("UNSUPPORTED_OPERATION", "Only adjacent paragraphs/headings can be merged", { path: params.blockId }));
      const mergeOffset = getPlainText(previous).length;
      const merged = { ...previous, children: [...previous.children, ...current.children] };
      const content = [...doc.content];
      content.splice(index - 1, 2, merged);
      return ok({ document: { ...doc, content }, selection: { blockId: previous.id, offset: mergeOffset } });
    }
    for (let topIndex = 0; topIndex < doc.content.length; topIndex++) {
      const top = doc.content[topIndex]!;
      if (top.type === "blockquote") {
        const childIndex = top.children.findIndex(child => child.id === params.blockId);
        if (childIndex <= 0) continue;
        const previous = top.children[childIndex - 1]!;
        const current = top.children[childIndex]!;
        const mergeOffset = getPlainText(previous).length;
        const children = [...top.children];
        children.splice(childIndex - 1, 2, { ...previous, children: [...previous.children, ...current.children] });
        const content = [...doc.content];
        content[topIndex] = { ...top, children };
        return ok({ document: { ...doc, content }, selection: { blockId: previous.id, offset: mergeOffset } });
      }
      if (top.type === "table") {
        for (let rowIndex = 0; rowIndex < top.children.length; rowIndex++) {
          const row = top.children[rowIndex]!;
          for (let cellIndex = 0; cellIndex < row.children.length; cellIndex++) {
            const cell = row.children[cellIndex]!;
            const childIndex = cell.children.findIndex(child => child.id === params.blockId);
            if (childIndex <= 0) continue;
            const previous = cell.children[childIndex - 1]!;
            const current = cell.children[childIndex]!;
            const mergeOffset = getPlainText(previous).length;
            const children = [...cell.children];
            children.splice(childIndex - 1, 2, { ...previous, children: [...previous.children, ...current.children] });
            const rows = [...top.children];
            const cells = [...row.children];
            cells[cellIndex] = { ...cell, children };
            rows[rowIndex] = { ...row, children: cells };
            const content = [...doc.content];
            content[topIndex] = { ...top, children: rows };
            return ok({ document: { ...doc, content }, selection: { blockId: previous.id, offset: mergeOffset } });
          }
        }
      }
    }
    return err(engineError("UNSUPPORTED_OPERATION", "No previous paragraph exists in this container", { path: params.blockId }));
  };
}

export function insertParagraphAfter(params: { blockId: string }): Command {
  return (doc, ctx) => {
    const index = findTopLevelIndex(doc.content, params.blockId);
    if (index === -1) return err(engineError("NODE_NOT_FOUND", `Top-level block "${params.blockId}" not found`, { path: params.blockId }));
    const newId = ctx.generateId();
    const paragraph: Paragraph = { type: "paragraph", id: newId, children: [{ type: "text", id: ctx.generateId(), text: "", marks: [] }] };
    const content = [...doc.content];
    content.splice(index + 1, 0, paragraph);
    return ok({ document: { ...doc, content }, selection: { blockId: newId, offset: 0 } });
  };
}

export function deleteBlock(params: { blockId: string }): Command {
  return (doc) => {
    const index = findTopLevelIndex(doc.content, params.blockId);
    if (index === -1) return err(engineError("NODE_NOT_FOUND", `Top-level block "${params.blockId}" not found`, { path: params.blockId }));
    if (doc.content.length === 1) {
      return err(engineError("UNSUPPORTED_OPERATION", "Cannot delete the only block of a document", { path: params.blockId }));
    }
    const content = doc.content.filter((block) => block.id !== params.blockId);
    const fallback = content[Math.max(0, index - 1)];
    const selection = isParagraphLike(fallback) ? { blockId: fallback.id, offset: getPlainText(fallback).length } : undefined;
    return ok({ document: { ...doc, content }, selection });
  };
}

/** Converts a top-level paragraph or heading into a blockquote without discarding its text or marks. */
export function convertBlockToBlockquote(params: { blockId: string }): Command {
  return (doc, ctx) => {
    const index = findTopLevelIndex(doc.content, params.blockId);
    if (index === -1) return err(engineError("NODE_NOT_FOUND", `Top-level block "${params.blockId}" not found`, { path: params.blockId }));
    const source = doc.content[index];
    if (!isParagraphLike(source)) return err(engineError("UNSUPPORTED_OPERATION", "Only a paragraph or heading can be converted into a blockquote", { path: params.blockId }));
    const paragraph: Paragraph = { type: "paragraph", id: source.id, align: source.align, children: source.children };
    const content = [...doc.content];
    content[index] = { type: "blockquote", id: ctx.generateId(), children: [paragraph] };
    return ok({ document: { ...doc, content }, selection: { blockId: paragraph.id, offset: 0 } });
  };
}

export function insertBlockquote(params: { afterBlockId: string }): Command {
  return (doc, ctx) => {
    const index = findTopLevelIndex(doc.content, params.afterBlockId);
    if (index === -1) return err(engineError("NODE_NOT_FOUND", `Top-level block "${params.afterBlockId}" not found`, { path: params.afterBlockId }));
    const paragraph: Paragraph = { type: "paragraph", id: ctx.generateId(), children: [{ type: "text", id: ctx.generateId(), text: "", marks: [] }] };
    const block: Block = { type: "blockquote", id: ctx.generateId(), children: [paragraph] };
    const content = [...doc.content];
    content.splice(index + 1, 0, block);
    return ok({ document: { ...doc, content }, selection: { blockId: paragraph.id, offset: 0 } });
  };
}

export function insertThematicBreak(params: { afterBlockId: string }): Command {
  return (doc, ctx) => {
    const index = findTopLevelIndex(doc.content, params.afterBlockId);
    if (index === -1) return err(engineError("NODE_NOT_FOUND", `Top-level block "${params.afterBlockId}" not found`, { path: params.afterBlockId }));
    const block: Block = { type: "thematicBreak", id: ctx.generateId() };
    const content = [...doc.content];
    content.splice(index + 1, 0, block);
    return ok({ document: { ...doc, content } });
  };
}

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
    if (index === -1) return err(engineError("NODE_NOT_FOUND", `Top-level block "${params.blockId}" not found`, { path: params.blockId }));
    const block = doc.content[index];
    if (!isParagraphLike(block)) {
      return err(engineError("UNSUPPORTED_OPERATION", `Block "${params.blockId}" cannot be split`, { path: params.blockId }));
    }
    const length = getPlainText(block).length;
    if (params.offset < 0 || params.offset > length) {
      return err(engineError("INVALID_POSITION", `Offset ${params.offset} out of range`, { path: params.blockId }));
    }
    const { before, after } = splitRunsAt(block.children, params.offset, ctx.generateId);
    const ensureRun = (runs: TextRun[]): TextRun[] => (runs.length > 0 ? runs : [{ type: "text", id: ctx.generateId(), text: "", marks: [] }]);
    const newBlockId = ctx.generateId();
    const first: Block = { ...block, children: ensureRun(before) } as Block;
    const second: Paragraph = { type: "paragraph", id: newBlockId, align: block.align, children: ensureRun(after) };
    const content = [...doc.content];
    content.splice(index, 1, first, second);
    return ok({ document: { ...doc, content }, selection: { blockId: newBlockId, offset: 0 } });
  };
}

/** Merges the top-level block `blockId` into its previous sibling, concatenating text content. */
export function mergeBlockWithPrevious(params: { blockId: string }): Command {
  return (doc) => {
    const index = findTopLevelIndex(doc.content, params.blockId);
    if (index <= 0) {
      return err(engineError("UNSUPPORTED_OPERATION", "No previous block to merge with", { path: params.blockId }));
    }
    const current = doc.content[index];
    const previous = doc.content[index - 1];
    if (!isParagraphLike(current) || !isParagraphLike(previous)) {
      return err(engineError("UNSUPPORTED_OPERATION", "Only paragraphs/headings can be merged", { path: params.blockId }));
    }
    const mergeOffset = getPlainText(previous).length;
    const merged = { ...previous, children: [...previous.children, ...current.children] };
    const content = [...doc.content];
    content.splice(index - 1, 2, merged);
    return ok({ document: { ...doc, content }, selection: { blockId: previous.id, offset: mergeOffset } });
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

import type { Block, BulletList, ListItem, OrderedList, Paragraph } from "../model/types";
import { findList, replaceList } from "../model/tree";
import { engineError } from "../errors/errors";
import { err, ok } from "../utils/result";
import type { Command } from "./types";

function makeEmptyParagraph(generateId: () => string): Paragraph {
  return { type: "paragraph", id: generateId(), children: [{ type: "text", id: generateId(), text: "", marks: [] }] };
}

function makeListItem(generateId: () => string): ListItem {
  return { type: "listItem", id: generateId(), children: [makeEmptyParagraph(generateId)] };
}

/** Inserts a new list (with one empty item) after the given top-level block. */
export function insertList(params: { afterBlockId: string; ordered: boolean }): Command {
  return (doc, ctx) => {
    const index = doc.content.findIndex((block) => block.id === params.afterBlockId);
    if (index === -1) return err(engineError("NODE_NOT_FOUND", `Top-level block "${params.afterBlockId}" not found`, { path: params.afterBlockId }));
    const item = makeListItem(ctx.generateId);
    const list: Block = params.ordered
      ? { type: "orderedList", id: ctx.generateId(), start: 1, children: [item] }
      : { type: "bulletList", id: ctx.generateId(), children: [item] };
    const content = [...doc.content];
    content.splice(index + 1, 0, list);
    const firstParagraph = item.children[0] as Paragraph;
    return ok({ document: { ...doc, content }, selection: { blockId: firstParagraph.id, offset: 0 } });
  };
}

/** Converts a top-level paragraph or heading into a list while preserving its text runs and stable paragraph ID. */
export function convertBlockToList(params: { blockId: string; ordered: boolean }): Command {
  return (doc, ctx) => {
    const index = doc.content.findIndex((block) => block.id === params.blockId);
    if (index < 0) return err(engineError("NODE_NOT_FOUND", `Top-level block "${params.blockId}" not found`, { path: params.blockId }));
    const source = doc.content[index];
    if (source.type !== "paragraph" && source.type !== "heading") {
      return err(engineError("UNSUPPORTED_OPERATION", "Only a paragraph or heading can be converted into a list", { path: params.blockId }));
    }
    const paragraph: Paragraph = { type: "paragraph", id: source.id, align: source.align, children: source.children };
    const item: ListItem = { type: "listItem", id: ctx.generateId(), children: [paragraph] };
    const list: Block = params.ordered
      ? { type: "orderedList", id: ctx.generateId(), start: 1, children: [item] }
      : { type: "bulletList", id: ctx.generateId(), children: [item] };
    const content = [...doc.content];
    content[index] = list;
    return ok({ document: { ...doc, content }, selection: { blockId: paragraph.id, offset: 0 } });
  };
}

/** Converts a list between bullet and ordered, preserving its items. */
export function convertListType(params: { listId: string; ordered: boolean }): Command {
  return (doc) => {
    const existing = findList(doc.content, params.listId);
    if (!existing) return err(engineError("NODE_NOT_FOUND", `List "${params.listId}" not found`, { path: params.listId }));
    const { blocks, found } = replaceList(doc.content, params.listId, (list) =>
      params.ordered
        ? ({ type: "orderedList", id: list.id, start: (list as OrderedList).start ?? 1, children: list.children } as OrderedList)
        : ({ type: "bulletList", id: list.id, children: list.children } as BulletList),
    );
    if (!found) return err(engineError("NODE_NOT_FOUND", `List "${params.listId}" not found`, { path: params.listId }));
    return ok({ document: { ...doc, content: blocks } });
  };
}

/** Inserts a new empty item after `afterItemId` (or at the start when omitted). */
export function insertListItem(params: { listId: string; afterItemId?: string }): Command {
  return (doc, ctx) => {
    const existing = findList(doc.content, params.listId);
    if (!existing) return err(engineError("NODE_NOT_FOUND", `List "${params.listId}" not found`, { path: params.listId }));
    const newItem = makeListItem(ctx.generateId);
    const { blocks } = replaceList(doc.content, params.listId, (list) => {
      const index = params.afterItemId ? list.children.findIndex((item) => item.id === params.afterItemId) : -1;
      const children = [...list.children];
      children.splice(index + 1, 0, newItem);
      return { ...list, children } as typeof list;
    });
    const firstParagraph = newItem.children[0] as Paragraph;
    return ok({ document: { ...doc, content: blocks }, selection: { blockId: firstParagraph.id, offset: 0 } });
  };
}

/** Removes an item from a list. Removing the last remaining item removes the whole list. */
export function removeListItem(params: { listId: string; itemId: string }): Command {
  return (doc) => {
    const existing = findList(doc.content, params.listId);
    if (!existing) return err(engineError("NODE_NOT_FOUND", `List "${params.listId}" not found`, { path: params.listId }));
    if (!existing.children.some((item) => item.id === params.itemId)) {
      return err(engineError("NODE_NOT_FOUND", `List item "${params.itemId}" not found`, { path: params.itemId }));
    }
    const { blocks } = replaceList(doc.content, params.listId, (list) => {
      const children = list.children.filter((item) => item.id !== params.itemId);
      if (children.length === 0) return null;
      return { ...list, children } as typeof list;
    });
    return ok({ document: { ...doc, content: blocks } });
  };
}

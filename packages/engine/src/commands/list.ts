import type { Block, BulletList, ListItem, OrderedList, Paragraph } from "../model/types";
import { findList, replaceList } from "../model/tree";
import { engineError } from "../errors/errors";
import { splitRunsAt } from "./text";
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

/** Splits a list item's paragraph at a logical text offset and creates the following list item. */
export function splitListItem(params: { listId: string; itemId: string; blockId: string; offset: number }): Command {
  return (doc, ctx) => {
    const list = findList(doc.content, params.listId);
    if (!list) return err(engineError("NODE_NOT_FOUND", `List "${params.listId}" not found`, { path: params.listId }));
    const itemIndex = list.children.findIndex(item => item.id === params.itemId);
    if (itemIndex < 0) return err(engineError("NODE_NOT_FOUND", `List item "${params.itemId}" not found`, { path: params.itemId }));
    const item = list.children[itemIndex];
    const paragraphIndex = item.children.findIndex(child => child.type === "paragraph" && child.id === params.blockId);
    if (paragraphIndex < 0) return err(engineError("UNSUPPORTED_OPERATION", "The selected paragraph is not a direct child of this list item", { path: params.blockId }));
    const paragraph = item.children[paragraphIndex] as Paragraph;
    const length = paragraph.children.reduce((total, run) => total + run.text.length, 0);
    if (params.offset < 0 || params.offset > length) return err(engineError("INVALID_POSITION", `Offset ${params.offset} out of range [0, ${length}]`, { path: params.blockId }));
    const parts = splitRunsAt(paragraph.children, params.offset, ctx.generateId);
    const ensureRun = (runs: Paragraph["children"]): Paragraph["children"] => runs.length ? runs : [{ type: "text", id: ctx.generateId(), text: "", marks: [] }];
    const firstParagraph: Paragraph = { ...paragraph, children: ensureRun(parts.before) };
    const secondParagraph: Paragraph = { type: "paragraph", id: ctx.generateId(), children: ensureRun(parts.after) };
    const beforeChildren = item.children.slice(0, paragraphIndex);
    const afterChildren = item.children.slice(paragraphIndex + 1);
    const firstItem: ListItem = { ...item, children: [...beforeChildren, firstParagraph] };
    const secondItem: ListItem = { type: "listItem", id: ctx.generateId(), children: [secondParagraph, ...afterChildren] };
    const converted = replaceList(doc.content, params.listId, current => {
      const children = [...current.children];
      children.splice(itemIndex, 1, firstItem, secondItem);
      return { ...current, children } as typeof current;
    });
    if (!converted.found) return err(engineError("NODE_NOT_FOUND", `List "${params.listId}" not found`, { path: params.listId }));
    return ok({ document: { ...doc, content: converted.blocks }, selection: { blockId: secondParagraph.id, offset: 0 } });
  };
}

/** Backspace at the start of a list paragraph merges it with the previous paragraph/item. */
export function mergeListItemWithPrevious(params: { listId: string; itemId: string; blockId: string }): Command {
  return (doc) => {
    const list = findList(doc.content, params.listId);
    if (!list) return err(engineError("NODE_NOT_FOUND", `List "${params.listId}" not found`, { path: params.listId }));
    const itemIndex = list.children.findIndex(item => item.id === params.itemId);
    if (itemIndex < 0) return err(engineError("NODE_NOT_FOUND", `List item "${params.itemId}" not found`, { path: params.itemId }));
    const item = list.children[itemIndex]!;
    const paragraphIndex = item.children.findIndex(child => child.type === "paragraph" && child.id === params.blockId);
    if (paragraphIndex < 0) return err(engineError("NODE_NOT_FOUND", `Paragraph "${params.blockId}" not found in list item`, { path: params.blockId }));
    let selection: { blockId: string; offset: number } | undefined;
    const converted = replaceList(doc.content, params.listId, current => {
      const children = [...current.children];
      if (paragraphIndex > 0) {
        const previous = item.children[paragraphIndex - 1];
        const currentParagraph = item.children[paragraphIndex];
        if (!previous || previous.type !== "paragraph" || !currentParagraph || currentParagraph.type !== "paragraph") return current;
        const offset = previous.children.reduce((total, run) => total + run.text.length, 0);
        const merged: Paragraph = { ...previous, children: [...previous.children, ...currentParagraph.children] };
        const itemChildren = [...item.children];
        itemChildren.splice(paragraphIndex - 1, 2, merged);
        children[itemIndex] = { ...item, children: itemChildren };
        selection = { blockId: previous.id, offset };
        return { ...current, children } as typeof current;
      }
      if (itemIndex <= 0) return current;
      const previousItem = children[itemIndex - 1]!;
      const currentParagraph = item.children[0];
      if (!currentParagraph || currentParagraph.type !== "paragraph") return current;
      const previousChildren = [...previousItem.children];
      const last = previousChildren[previousChildren.length - 1];
      if (last && last.type === "paragraph") {
        const offset = last.children.reduce((total, run) => total + run.text.length, 0);
        const merged: Paragraph = { ...last, children: [...last.children, ...currentParagraph.children] };
        previousChildren[previousChildren.length - 1] = merged;
        selection = { blockId: last.id, offset };
      } else {
        previousChildren.push(currentParagraph);
        selection = { blockId: currentParagraph.id, offset: 0 };
      }
      previousChildren.push(...item.children.slice(1));
      children.splice(itemIndex - 1, 2, { ...previousItem, children: previousChildren });
      return { ...current, children } as typeof current;
    });
    if (!converted.found) return err(engineError("NODE_NOT_FOUND", `List "${params.listId}" not found`, { path: params.listId }));
    if (!selection) return err(engineError("UNSUPPORTED_OPERATION", "No previous paragraph to merge with", { path: params.blockId }));
    return ok({ document: { ...doc, content: converted.blocks }, selection });
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

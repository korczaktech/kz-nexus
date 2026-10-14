/**
 * Generic, side-effect-free tree traversal helpers shared by the command
 * implementations. These are the only place that understands how to walk
 * into nested containers (lists, table cells, blockquotes) so individual
 * commands stay small and declarative.
 */
import type { Block, BulletList, Heading, ListItem, ListItemContent, OrderedList, Paragraph, Table, TextRun } from "./types";

export type ParagraphLike = Paragraph | Heading;

export function isParagraphLike(block: Block): block is ParagraphLike {
  return block.type === "paragraph" || block.type === "heading";
}

export function getPlainText(node: { children: TextRun[] }): string {
  return node.children.map((run) => run.text).join("");
}

/** Updates one paragraph/heading by ID, copying only the containers on its path. */
export function updateParagraphLike(
  blocks: Block[],
  id: string,
  fn: (node: ParagraphLike) => ParagraphLike,
): { blocks: Block[]; found: boolean } {
  for (let index = 0; index < blocks.length; index += 1) {
    const result = updateParagraphLikeInBlock(blocks[index]!, id, fn);
    if (!result.found) continue;
    const next = blocks.slice();
    next[index] = result.block;
    return { blocks: next, found: true };
  }
  return { blocks, found: false };
}

function updateParagraphLikeInBlock(
  block: Block,
  id: string,
  fn: (node: ParagraphLike) => ParagraphLike,
): { block: Block; found: boolean } {
  switch (block.type) {
    case "paragraph":
    case "heading":
      return block.id === id ? { block: fn(block), found: true } : { block, found: false };
    case "blockquote": {
      const index = block.children.findIndex(child => child.id === id);
      if (index < 0) return { block, found: false };
      const children = block.children.slice();
      children[index] = fn(children[index]!) as Paragraph;
      return { block: { ...block, children }, found: true };
    }
    case "bulletList":
    case "orderedList": {
      for (let index = 0; index < block.children.length; index += 1) {
        const result = updateParagraphLikeInListItem(block.children[index]!, id, fn);
        if (!result.found) continue;
        const children = block.children.slice();
        children[index] = result.item;
        return { block: { ...block, children } as Block, found: true };
      }
      return { block, found: false };
    }
    case "table": {
      for (let rowIndex = 0; rowIndex < block.children.length; rowIndex += 1) {
        const row = block.children[rowIndex]!;
        for (let cellIndex = 0; cellIndex < row.children.length; cellIndex += 1) {
          const cell = row.children[cellIndex]!;
          const paragraphIndex = cell.children.findIndex(child => child.id === id);
          if (paragraphIndex < 0) continue;
          const paragraphs = cell.children.slice();
          paragraphs[paragraphIndex] = fn(paragraphs[paragraphIndex]!) as Paragraph;
          const cells = row.children.slice();
          cells[cellIndex] = { ...cell, children: paragraphs };
          const rows = block.children.slice();
          rows[rowIndex] = { ...row, children: cells };
          return { block: { ...block, children: rows }, found: true };
        }
      }
      return { block, found: false };
    }
    case "thematicBreak":
    case "image":
      return { block, found: false };
  }
}

function updateParagraphLikeInListItem(
  item: ListItem,
  id: string,
  fn: (node: ParagraphLike) => ParagraphLike,
): { item: ListItem; found: boolean } {
  for (let index = 0; index < item.children.length; index += 1) {
    const child = item.children[index]!;
    if (child.type === "paragraph") {
      if (child.id !== id) continue;
      const children = item.children.slice();
      children[index] = fn(child) as Paragraph;
      return { item: { ...item, children }, found: true };
    }
    const result = updateParagraphLikeInBlock(child, id, fn);
    if (!result.found) continue;
    const children = item.children.slice();
    children[index] = result.block as BulletList | OrderedList;
    return { item: { ...item, children }, found: true };
  }
  return { item, found: false };
}

/** Deeply maps every paragraph/heading node reachable from `blocks`, rebuilding containers immutably. */
export function mapParagraphLike(blocks: Block[], fn: (node: ParagraphLike) => ParagraphLike): Block[] {
  return blocks.map((block) => mapParagraphLikeInBlock(block, fn));
}

function mapParagraphLikeInBlock(block: Block, fn: (node: ParagraphLike) => ParagraphLike): Block {
  switch (block.type) {
    case "paragraph":
    case "heading":
      return fn(block);
    case "blockquote":
      return { ...block, children: block.children.map((p) => fn(p) as Paragraph) };
    case "bulletList":
    case "orderedList":
      return { ...block, children: block.children.map((item) => mapParagraphLikeInListItem(item, fn)) } as Block;
    case "table":
      return {
        ...block,
        children: block.children.map((row) => ({
          ...row,
          children: row.children.map((cell) => ({ ...cell, children: cell.children.map((p) => fn(p) as Paragraph) })),
        })),
      };
    case "thematicBreak":
    case "image":
      return block;
  }
}

function mapParagraphLikeInListItem(item: ListItem, fn: (node: ParagraphLike) => ParagraphLike): ListItem {
  return {
    ...item,
    children: item.children.map((child): ListItemContent => {
      if (child.type === "paragraph") return fn(child) as Paragraph;
      return mapParagraphLikeInBlock(child, fn) as BulletList | OrderedList;
    }),
  };
}

export function findParagraphLike(blocks: Block[], id: string): ParagraphLike | undefined {
  for (const block of blocks) {
    const found = findParagraphLikeInBlock(block, id);
    if (found) return found;
  }
  return undefined;
}

function findParagraphLikeInBlock(block: Block, id: string): ParagraphLike | undefined {
  switch (block.type) {
    case "paragraph":
    case "heading":
      return block.id === id ? block : undefined;
    case "blockquote":
      return block.children.find((p) => p.id === id);
    case "bulletList":
    case "orderedList":
      for (const item of block.children) {
        const found = findParagraphLikeInListItem(item, id);
        if (found) return found;
      }
      return undefined;
    case "table":
      for (const row of block.children) {
        for (const cell of row.children) {
          const found = cell.children.find((p) => p.id === id);
          if (found) return found;
        }
      }
      return undefined;
    case "thematicBreak":
    case "image":
      return undefined;
  }
}

function findParagraphLikeInListItem(item: ListItem, id: string): ParagraphLike | undefined {
  for (const child of item.children) {
    if (child.type === "paragraph") {
      if (child.id === id) return child;
    } else {
      const found = findParagraphLikeInBlock(child, id);
      if (found) return found;
    }
  }
  return undefined;
}

/** Finds a list (bullet or ordered) anywhere in the tree, including nested inside list items. */
export function findList(blocks: Block[], listId: string): BulletList | OrderedList | undefined {
  for (const block of blocks) {
    const found = findListInBlock(block, listId);
    if (found) return found;
  }
  return undefined;
}

function findListInBlock(block: Block, listId: string): BulletList | OrderedList | undefined {
  if (block.type === "bulletList" || block.type === "orderedList") {
    if (block.id === listId) return block;
    for (const item of block.children) {
      for (const child of item.children) {
        if (child.type !== "paragraph") {
          const found = findListInBlock(child, listId);
          if (found) return found;
        }
      }
    }
  }
  return undefined;
}

/** Replaces (or removes, when `transform` returns null) a list anywhere in the tree. */
export function replaceList(
  blocks: Block[],
  listId: string,
  transform: (list: BulletList | OrderedList) => BulletList | OrderedList | null,
): { blocks: Block[]; found: boolean } {
  let found = false;
  const next = blocks
    .map((block) => replaceListInBlock(block, listId, transform, (value) => (found = value || found)))
    .filter((block): block is Block => block !== null);
  return { blocks: next, found };
}

function replaceListInBlock(
  block: Block,
  listId: string,
  transform: (list: BulletList | OrderedList) => BulletList | OrderedList | null,
  setFound: (value: boolean) => void,
): Block | null {
  if (block.type === "bulletList" || block.type === "orderedList") {
    if (block.id === listId) {
      setFound(true);
      const result = transform(block);
      return result;
    }
    const newChildren: ListItem[] = [];
    for (const item of block.children) {
      const newItemChildren: ListItemContent[] = [];
      for (const child of item.children) {
        if (child.type === "paragraph") {
          newItemChildren.push(child);
        } else {
          const replaced = replaceListInBlock(child, listId, transform, setFound);
          if (replaced) newItemChildren.push(replaced as BulletList | OrderedList);
        }
      }
      if (newItemChildren.length > 0) newChildren.push({ ...item, children: newItemChildren });
    }
    return { ...block, children: newChildren } as Block;
  }
  return block;
}

export function findTable(blocks: Block[], tableId: string): Table | undefined {
  return blocks.find((block): block is Table => block.type === "table" && block.id === tableId);
}

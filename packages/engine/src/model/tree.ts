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

export function getPlainText(node: Block | { children: TextRun[] }): string {
  if ("type" in node) {
    switch (node.type) {
      case "paragraph":
      case "heading":
        return node.children.map(run => run.text).join("");
      case "blockquote":
        return node.children.map(child => getPlainText(child)).join("\n");
      case "bulletList":
      case "orderedList":
        return node.children.map((item, index) => item.children.map(child =>
          child.type === "paragraph" ? getPlainText(child) : getPlainText(child)
        ).join("\n")).join("\n");
      case "table":
        return node.children.map(row => row.children.map(cell => cell.children.map(child => getPlainText(child)).join("\n")).join("\t")).join("\n");
      case "image":
        return node.alt;
      case "thematicBreak":
        return "";
    }
  }
  return node.children.map(run => run.text).join("");
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
          const updated = updateParagraphLike(cell.children, id, fn);
          if (!updated.found) continue;
          const cells = row.children.slice();
          cells[cellIndex] = { ...cell, children: updated.blocks };
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
          children: row.children.map((cell) => ({ ...cell, children: mapParagraphLike(cell.children, fn) })),
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
          const found = findParagraphLike(cell.children, id);
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

function emptyParagraphFromId(prefix: string): Paragraph {
  return {
    type: "paragraph",
    id: prefix + "empty",
    children: [{ type: "text", id: prefix + "emptyrun", text: "", marks: [] }],
  };
}

/** Replaces a block by ID through the canonical tree, including table cells and nested list items. */
export function replaceBlockById(blocks: Block[], id: string, replacement: Block[]): { blocks: Block[]; found: boolean } {
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]!;
    if (block.id === id) {
      const next = blocks.slice();
      next.splice(index, 1, ...replacement);
      return { blocks: next, found: true };
    }
    if (block.type === "table") {
      for (let rowIndex = 0; rowIndex < block.children.length; rowIndex += 1) {
        const row = block.children[rowIndex]!;
        for (let cellIndex = 0; cellIndex < row.children.length; cellIndex += 1) {
          const cell = row.children[cellIndex]!;
          const nested = replaceBlockById(cell.children, id, replacement);
          if (!nested.found) continue;
          const cells = row.children.slice();
          cells[cellIndex] = { ...cell, children: nested.blocks.length ? nested.blocks : [emptyParagraphFromId(cell.id)] };
          const rows = block.children.slice();
          rows[rowIndex] = { ...row, children: cells };
          const next = blocks.slice();
          next[index] = { ...block, children: rows };
          return { blocks: next, found: true };
        }
      }
    } else if (block.type === "bulletList" || block.type === "orderedList") {
      for (let itemIndex = 0; itemIndex < block.children.length; itemIndex += 1) {
        const item = block.children[itemIndex]!;
        for (let childIndex = 0; childIndex < item.children.length; childIndex += 1) {
          const child = item.children[childIndex]!;
          if (child.id === id) {
            if (replacement.some(node => node.type !== "paragraph" && node.type !== "bulletList" && node.type !== "orderedList")) continue;
            const itemChildren = item.children.slice();
            if (replacement.length === 0 && item.children.length === 1) {
              itemChildren.splice(childIndex, 1, emptyParagraphFromId(child.id) as Paragraph);
            } else {
              itemChildren.splice(childIndex, 1, ...replacement as ListItemContent[]);
            }
            const items = block.children.slice();
            items[itemIndex] = { ...item, children: itemChildren };
            const next = blocks.slice();
            next[index] = { ...block, children: items } as Block;
            return { blocks: next, found: true };
          }
          if (child.type === "bulletList" || child.type === "orderedList") {
            const nested = replaceBlockById([child], id, replacement);
            if (!nested.found) continue;
            const itemChildren = item.children.slice();
            itemChildren.splice(childIndex, 1, ...nested.blocks as ListItemContent[]);
            const items = block.children.slice();
            items[itemIndex] = { ...item, children: itemChildren };
            const next = blocks.slice();
            next[index] = { ...block, children: items } as Block;
            return { blocks: next, found: true };
          }
        }
      }
    } else if (block.type === "blockquote") {
      const childIndex = block.children.findIndex(child => child.id === id);
      if (childIndex >= 0) {
        const children = block.children.slice();
        if (replacement.length === 1 && replacement[0]?.type === "paragraph") {
          children.splice(childIndex, 1, replacement[0]);
        } else if (replacement.length === 0 && block.children.length > 1) {
          children.splice(childIndex, 1);
        } else if (replacement.length === 0) {
          children.splice(childIndex, 1, emptyParagraphFromId(block.children[childIndex]!.id));
        } else {
          continue;
        }
        const next = blocks.slice();
        next[index] = { ...block, children };
        return { blocks: next, found: true };
      }
    }
  }
  return { blocks, found: false };
}

export function findTable(blocks: Block[], tableId: string): Table | undefined {
  const visit = (block: Block): Table | undefined => {
    if (block.type === "table") {
      if (block.id === tableId) return block;
      for (const row of block.children) for (const cell of row.children) {
        const nested = findTable(cell.children, tableId);
        if (nested) return nested;
      }
    }
    if (block.type === "bulletList" || block.type === "orderedList") {
      for (const item of block.children) for (const child of item.children) {
        if (child.type === "paragraph") continue;
        const nested = visit(child);
        if (nested) return nested;
      }
    }
    return undefined;
  };
  for (const block of blocks) {
    const found = visit(block);
    if (found) return found;
  }
  return undefined;
}

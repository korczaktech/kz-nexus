import type { Block, Heading, ListItem, NexusDocument, Paragraph } from "@korczak/nexus-engine";

export type TextBlock = Paragraph | Heading;

export interface TextBlockInfo {
  block: TextBlock;
  /** Index of the top-level block that contains this text block. */
  topIndex: number;
  /** Where the text block lives. */
  container: "top" | "listItem" | "tableCell" | "blockquote";
  /** Closest list / item / table ids, when applicable. */
  listId?: string;
  itemId?: string;
  tableId?: string;
  rowId?: string;
  cellId?: string;
}

function collectFromItems(items: ListItem[], listId: string, topIndex: number, out: TextBlockInfo[]): void {
  for (const item of items) {
    for (const child of item.children) {
      if (child.type === "paragraph") out.push({ block: child, topIndex, container: "listItem", listId, itemId: item.id });
      else collectFromItems(child.children, child.id, topIndex, out);
    }
  }
}

/** Lists every paragraph/heading in document order, with its structural context. */
export function collectTextBlocks(doc: NexusDocument): TextBlockInfo[] {
  const out: TextBlockInfo[] = [];
  doc.content.forEach((block: Block, topIndex) => {
    switch (block.type) {
      case "paragraph":
      case "heading":
        out.push({ block, topIndex, container: "top" });
        break;
      case "blockquote":
        for (const p of block.children) out.push({ block: p, topIndex, container: "blockquote" });
        break;
      case "bulletList":
      case "orderedList":
        collectFromItems(block.children, block.id, topIndex, out);
        break;
      case "table":
        for (const row of block.children)
          for (const cell of row.children)
            for (const p of cell.children) out.push({ block: p, topIndex, container: "tableCell", tableId: block.id, rowId: row.id, cellId: cell.id });
        break;
      default:
        break;
    }
  });
  return out;
}

export function textOf(block: TextBlock): string {
  return block.children.map((run) => run.text).join("");
}

/** Counts every node (blocks, runs, items, rows, cells) in the document. */
export function countNodes(doc: NexusDocument): number {
  let count = 0;
  const visit = (node: unknown): void => {
    if (node === null || typeof node !== "object") return;
    const n = node as { type?: unknown; children?: unknown };
    if (typeof n.type === "string") count += 1;
    if (Array.isArray(n.children)) n.children.forEach(visit);
  };
  doc.content.forEach(visit);
  return count;
}

const isHigh = (c: number): boolean => c >= 0xd800 && c <= 0xdbff;
const isLow = (c: number): boolean => c >= 0xdc00 && c <= 0xdfff;
const isCombining = (c: number): boolean => (c >= 0x0300 && c <= 0x036f) || c === 0x200d || (c >= 0xfe00 && c <= 0xfe0f);

/** Previous user-perceived boundary (handles surrogate pairs and combining marks). */
export function previousBoundary(text: string, offset: number): number {
  let i = offset;
  if (i <= 0) return 0;
  i -= 1;
  if (isLow(text.charCodeAt(i)) && i > 0 && isHigh(text.charCodeAt(i - 1))) i -= 1;
  while (i > 0 && isCombining(text.charCodeAt(i))) {
    i -= 1;
    if (isLow(text.charCodeAt(i)) && i > 0 && isHigh(text.charCodeAt(i - 1))) i -= 1;
  }
  return i;
}

export function nextBoundary(text: string, offset: number): number {
  let i = offset;
  if (i >= text.length) return text.length;
  i += isHigh(text.charCodeAt(i)) && i + 1 < text.length ? 2 : 1;
  while (i < text.length && isCombining(text.charCodeAt(i))) i += 1;
  return i;
}

import type { Block, ListItem, NexusDocument } from "../model/types";
import { getPlainText } from "../model/tree";

type ListBlock = Extract<Block, { type: "bulletList" | "orderedList" }>;

function listItemLines(item: ListItem, prefix: string, depth: number): string[] {
  const lines: string[] = [];
  for (const child of item.children) {
    if (child.type === "paragraph") lines.push(`${"  ".repeat(depth)}${prefix}${getPlainText(child)}`);
    else lines.push(...listLines(child, depth + 1));
  }
  return lines;
}

function listLines(block: ListBlock, depth: number): string[] {
  const lines: string[] = [];
  block.children.forEach((item, index) => {
    const prefix = block.type === "orderedList" ? `${block.start + index}. ` : "- ";
    lines.push(...listItemLines(item, prefix, depth));
  });
  return lines;
}

function blockLines(block: Block): string[] {
  switch (block.type) {
    case "paragraph":
    case "heading":
      return [getPlainText(block)];
    case "blockquote":
      return block.children.map((p) => `> ${getPlainText(p)}`);
    case "thematicBreak":
      return ["---"];
    case "bulletList":
    case "orderedList":
      return listLines(block, 0);
    case "table":
      return block.children.map((row) => row.children.map((cell) => cell.children.flatMap(blockLines).join(" " )).join("\t"));
    case "image":
      return [`[image: ${block.alt}]`];
  }
}

/**
 * Exports the document as plain text. Lossy by design: formatting, resources
 * and layout are dropped (documented in docs/ARCHITECTURE.md).
 */
export function exportPlainText(doc: NexusDocument): string {
  return doc.content.flatMap(blockLines).join("\n");
}

import type { LayoutBlock, LayoutLine, LayoutPage, LayoutRect, LayoutResult } from "./layout";
import type { Selection } from "../selection/selection";
import type { HitTestMeasureText } from "./hitTesting";

export interface SelectionGeometry {
  caret?: { x: number; y: number; height: number };
  selectionRects: LayoutRect[];
}

function findBlock(blocks: LayoutBlock[], blockId: string): LayoutBlock | undefined {
  for (const block of blocks) {
    if (block.blockId === blockId && block.lines.length) return block;
    const nested = findBlock(block.children ?? [], blockId);
    if (nested) return nested;
    for (const row of block.table?.rows ?? []) for (const cell of row.cells) {
      const nestedCell = findBlock(cell.children ?? [], blockId);
      if (nestedCell) return nestedCell;
    }
  }
  return undefined;
}

function widthBetween(line: LayoutLine, start: number, end: number, measureText?: HitTestMeasureText): number {
  const from = Math.max(line.startOffset, Math.min(line.endOffset, start));
  const to = Math.max(from, Math.min(line.endOffset, end));
  if (from === to) return 0;
  if (measureText && line.runs?.length) {
    let total = 0;
    for (const run of line.runs) {
      const overlapStart = Math.max(from, run.startOffset);
      const overlapEnd = Math.min(to, run.endOffset);
      if (overlapEnd <= overlapStart) continue;
      const localStart = overlapStart - run.startOffset;
      const localEnd = overlapEnd - run.startOffset;
      total += measureText(run.text.slice(localStart, localEnd), run);
    }
    return total;
  }
  const fraction = (to - from) / Math.max(1, line.endOffset - line.startOffset);
  return Math.max(0, line.width * fraction);
}

function xAtOffset(line: LayoutLine, offset: number, measureText?: HitTestMeasureText): number {
  return line.x + widthBetween(line, line.startOffset, offset, measureText);
}

/** Derives caret/selection geometry from layout; does not read or mutate the DOM. */
export function getSelectionGeometry(
  layout: LayoutResult,
  pageIndex: number,
  selection: Selection | undefined,
  measureText?: HitTestMeasureText,
): SelectionGeometry {
  const empty: SelectionGeometry = { selectionRects: [] };
  if (!selection || !Number.isInteger(pageIndex)) return empty;
  const page: LayoutPage | undefined = layout.pages[pageIndex];
  if (!page) return empty;

  const blocks: Array<{ pageIndex: number; block: LayoutBlock }> = [];
  const collect = (items: LayoutBlock[], currentPage: number) => {
    for (const item of items) {
      if (item.lines.length) blocks.push({ pageIndex: currentPage, block: item });
      collect(item.children ?? [], currentPage);
      for (const row of item.table?.rows ?? []) for (const cell of row.cells) collect(cell.children ?? [], currentPage);
    }
  };
  layout.pages.forEach(item => collect(item.blocks, item.index));
  const anchorIndex = blocks.findIndex(item => item.block.blockId === selection.anchor.blockId);
  const focusIndex = blocks.findIndex(item => item.block.blockId === selection.focus.blockId);
  if (anchorIndex < 0 || focusIndex < 0) return empty;

  if (anchorIndex === focusIndex && selection.anchor.offset === selection.focus.offset) {
    const block = blocks[anchorIndex].block;
    if (blocks[anchorIndex].pageIndex !== pageIndex) return empty;
    const offset = selection.focus.offset;
    // At a soft-wrap boundary, the previous line's endOffset equals the next
    // line's startOffset. Prefer the line that starts at the caret offset so
    // typing spaces (or continuing after a wrap) moves the visible caret
    // immediately instead of leaving it on the previous line until the next
    // non-whitespace character.
    const line = block.lines.find(item => item.startOffset === offset && item.endOffset > item.startOffset)
      ?? [...block.lines].reverse().find(item => offset >= item.startOffset && offset <= item.endOffset);
    if (!line) return empty;
    return {
      caret: { x: xAtOffset(line, offset, measureText), y: line.y, height: line.height },
      selectionRects: [],
    };
  }

  const forward = anchorIndex < focusIndex ||
    (anchorIndex === focusIndex && selection.anchor.offset <= selection.focus.offset);
  const firstIndex = forward ? anchorIndex : focusIndex;
  const lastIndex = forward ? focusIndex : anchorIndex;
  const startOffset = forward ? selection.anchor.offset : selection.focus.offset;
  const endOffset = forward ? selection.focus.offset : selection.anchor.offset;
  const selectionRects: LayoutRect[] = [];

  for (let index = firstIndex; index <= lastIndex; index++) {
    const entry = blocks[index];
    if (entry.pageIndex !== pageIndex) continue;
    const lines = entry.block.lines;
    if (!lines.length) continue;
    const fromBlock = index === firstIndex;
    const toBlock = index === lastIndex;
    const start = fromBlock ? startOffset : lines[0].startOffset;
    const end = toBlock ? endOffset : lines[lines.length - 1].endOffset;
    for (const line of lines) {
      const from = Math.max(start, line.startOffset);
      const to = Math.min(end, line.endOffset);
      if (to <= from) continue;
      const left = xAtOffset(line, from, measureText);
      const right = xAtOffset(line, to, measureText);
      selectionRects.push({ x: left, y: line.y, width: Math.max(0, right - left), height: line.height });
    }
  }
  return { selectionRects };
}

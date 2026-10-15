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
  if (!page || selection.anchor.blockId !== selection.focus.blockId) return empty;

  const block = findBlock(page.blocks, selection.anchor.blockId);
  if (!block) return empty;

  const anchor = selection.anchor.offset;
  const focus = selection.focus.offset;
  const start = Math.min(anchor, focus);
  const end = Math.max(anchor, focus);

  if (start === end) {
    const line = block.lines.find(item => start >= item.startOffset && start <= item.endOffset);
    if (!line) return empty;
    return {
      caret: { x: xAtOffset(line, start, measureText), y: line.y, height: line.height },
      selectionRects: [],
    };
  }

  const selectionRects: LayoutRect[] = [];
  for (const line of block.lines) {
    const from = Math.max(start, line.startOffset);
    const to = Math.min(end, line.endOffset);
    if (to <= from) continue;
    const left = xAtOffset(line, from, measureText);
    const right = xAtOffset(line, to, measureText);
    selectionRects.push({ x: left, y: line.y, width: Math.max(0, right - left), height: line.height });
  }
  return { selectionRects };
}

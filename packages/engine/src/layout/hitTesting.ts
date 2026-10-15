import type { LayoutBlock, LayoutLine, LayoutPage, LayoutResult, LayoutTextRun } from "./layout";
import type { Position } from "../selection/selection";

export type HitTestMeasureText = (text: string, run?: LayoutTextRun) => number;

export type SmartCanvasHitTarget =
  | { kind: "text"; pageIndex: number; blockId: string; position: Position; lineIndex: number }
  | { kind: "table-cell"; pageIndex: number; blockId: string; cellId: string; offset: number; lineIndex: number }
  | { kind: "block"; pageIndex: number; blockId: string };

export interface HitTestOptions {
  measureText?: HitTestMeasureText;
  nearestBlock?: boolean;
}

type Candidate = { target: SmartCanvasHitTarget; distance: number; order: number };

function distanceToRect(x: number, y: number, rect: { x: number; y: number; width: number; height: number }): number {
  const dx = x < rect.x ? rect.x - x : x > rect.x + rect.width ? x - rect.x - rect.width : 0;
  const dy = y < rect.y ? rect.y - y : y > rect.y + rect.height ? y - rect.y - rect.height : 0;
  return Math.hypot(dx, dy);
}

function offsetAtX(line: LayoutLine, x: number, measureText?: HitTestMeasureText): number {
  if (!line.text.length || x <= line.x) return line.startOffset;
  if (measureText && line.runs?.length) {
    let cursorX = line.x;
    for (const run of line.runs) {
      for (let offset = run.startOffset; offset < run.endOffset; offset += 1) {
        const localOffset = offset - run.startOffset;
        const previous = run.text.slice(0, localOffset);
        const current = run.text.slice(0, localOffset + 1);
        const width = Math.max(0, measureText(current, run) - measureText(previous, run));
        if (x < cursorX + width / 2) return offset;
        cursorX += width;
      }
    }
    return line.endOffset;
  }
  const fraction = Math.max(0, Math.min(1, (x - line.x) / Math.max(1, line.width)));
  return Math.max(line.startOffset, Math.min(line.endOffset, line.startOffset + Math.round(line.text.length * fraction)));
}

function lineDistance(line: LayoutLine, x: number, y: number): number {
  return distanceToRect(x, y, { x: line.x, y: line.y, width: Math.max(1, line.width), height: Math.max(1, line.height) });
}

function visitBlock(block: LayoutBlock, pageIndex: number, x: number, y: number, options: HitTestOptions, candidates: Candidate[], order: { value: number }): void {
  candidates.push({
    target: { kind: "block", pageIndex, blockId: block.blockId },
    distance: distanceToRect(x, y, block.rect) + 0.001,
    order: order.value++,
  });
  for (let lineIndex = 0; lineIndex < block.lines.length; lineIndex += 1) {
    const line = block.lines[lineIndex];
    candidates.push({
      target: { kind: "text", pageIndex, blockId: block.blockId, position: { blockId: block.blockId, offset: offsetAtX(line, x, options.measureText) }, lineIndex },
      distance: lineDistance(line, x, y),
      order: order.value++,
    });
  }
  if (block.table) {
    for (const row of block.table.rows) for (const cell of row.cells) {
      for (let lineIndex = 0; lineIndex < cell.lines.length; lineIndex += 1) {
        const line = cell.lines[lineIndex];
        candidates.push({
          target: { kind: "table-cell", pageIndex, blockId: block.blockId, cellId: cell.cellId, offset: offsetAtX(line, x, options.measureText), lineIndex },
          distance: lineDistance(line, x, y),
          order: order.value++,
        });
      }
      candidates.push({
        target: { kind: "table-cell", pageIndex, blockId: block.blockId, cellId: cell.cellId, offset: 0, lineIndex: -1 },
        distance: distanceToRect(x, y, cell.rect),
        order: order.value++,
      });
    }
  }
  for (const child of block.children ?? []) visitBlock(child, pageIndex, x, y, options, candidates, order);
}

/** Maps page-local coordinates in points to the nearest logical text, cell, or block target. Never reads the DOM. */
export function hitTestLayout(layout: LayoutResult, pageIndex: number, x: number, y: number, options: HitTestOptions = {}): SmartCanvasHitTarget | undefined {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  const page: LayoutPage | undefined = layout.pages[pageIndex];
  if (!page) return undefined;
  const candidates: Candidate[] = [];
  const order = { value: 0 };
  for (const block of page.blocks) visitBlock(block, pageIndex, x, y, options, candidates, order);
  if (!candidates.length) return undefined;
  const exact = candidates.filter(candidate => candidate.distance === 0);
  const pool = exact.length ? exact : options.nearestBlock ? candidates : [];
  if (!pool.length) return undefined;
  pool.sort((a, b) => a.distance - b.distance || a.order - b.order);
  return pool[0].target;
}

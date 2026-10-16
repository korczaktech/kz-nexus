import { describe, expect, it } from "vitest";
import { hitTestLayout, type LayoutResult } from "../../../packages/engine/src/index";

const line = {
  text: "hello",
  x: 10,
  y: 20,
  width: 50,
  height: 12,
  startOffset: 0,
  endOffset: 5,
  runs: [{ text: "hello", startOffset: 0, endOffset: 5, fontSize: 12, fontFamily: "Arial", marks: [], width: 50 }],
};

const layout = {
  pages: [{
    index: 0,
    width: 600,
    height: 800,
    content: { x: 20, y: 20, width: 560, height: 760 },
    blocks: [{
      blockId: "paragraph-1",
      type: "paragraph",
      pageIndex: 0,
      rect: { x: 10, y: 18, width: 100, height: 20 },
      lines: [line],
    }],
  }],
  pageCount: 1,
  diagnostics: [],
} as unknown as LayoutResult;

describe("SmartCanvas layout hit testing", () => {
  it("maps a point on a text line to a logical position without DOM selection", () => {
    const target = hitTestLayout(layout, 0, 35, 25);
    expect(target).toMatchObject({
      kind: "text",
      pageIndex: 0,
      blockId: "paragraph-1",
      position: { blockId: "paragraph-1" },
      lineIndex: 0,
    });
    if (target?.kind === "text") expect(target.position.offset).toBeGreaterThanOrEqual(0);
    if (target?.kind === "text") expect(target.position.offset).toBeLessThanOrEqual(5);
  });

  it("uses host text metrics for a stable caret offset", () => {
    const target = hitTestLayout(layout, 0, 24, 25, {
      measureText: text => text.length * 10,
    });
    expect(target).toMatchObject({ kind: "text", position: { blockId: "paragraph-1", offset: 1 } });
  });

  it("maps hit-test offsets across paragraph boundaries inside a table cell", () => {
    const tableLayout = {
      ...layout,
      pages: [{
        ...layout.pages[0],
        blocks: [{
          blockId: "table-multiline",
          type: "table",
          pageIndex: 0,
          rect: { x: 0, y: 0, width: 200, height: 100 },
          lines: [],
          table: {
            rows: [{
              rowId: "row-multiline",
              rect: { x: 0, y: 0, width: 200, height: 60 },
              cells: [{
                cellId: "cell-multiline",
                rect: { x: 10, y: 10, width: 100, height: 50 },
                lines: [
                  { ...line, text: "first", x: 15, y: 15, startOffset: 0, endOffset: 5 },
                  { ...line, text: "second", x: 15, y: 35, startOffset: 0, endOffset: 6 },
                ],
              }],
            }],
          },
        }],
      }],
    } as unknown as LayoutResult;
    expect(hitTestLayout(tableLayout, 0, 15, 35)).toMatchObject({
      kind: "table-cell",
      blockId: "table-multiline",
      cellId: "cell-multiline",
      offset: 6,
      lineIndex: 1,
    });
  });

  it("returns no target for invalid coordinates or a missing page", () => {
    expect(hitTestLayout(layout, 4, 20, 20)).toBeUndefined();
    expect(hitTestLayout(layout, 0, Number.NaN, 20)).toBeUndefined();
    expect(hitTestLayout(layout, 0, 500, 700)).toBeUndefined();
  });

  it("can optionally resolve blank areas to the nearest block", () => {
    expect(hitTestLayout(layout, 0, 500, 700)).toBeUndefined();
    expect(hitTestLayout(layout, 0, 500, 700, { nearestBlock: true })).toMatchObject({
      kind: "block",
      blockId: "paragraph-1",
    });
  });

  it("resolves blank areas inside table cells to the cell rather than the table block", () => {
    const tableLayout = {
      ...layout,
      pages: [{
        ...layout.pages[0],
        blocks: [{
          blockId: "table-1",
          type: "table",
          pageIndex: 0,
          rect: { x: 0, y: 0, width: 200, height: 100 },
          lines: [],
          table: {
            rows: [{
              rowId: "row-1",
              rect: { x: 0, y: 0, width: 200, height: 100 },
              cells: [{
                cellId: "cell-1",
                rect: { x: 10, y: 10, width: 80, height: 40 },
                lines: [{ ...line, x: 15, y: 15, width: 30 }],
              }],
            }],
          },
        }],
      }],
    } as unknown as LayoutResult;
    expect(hitTestLayout(tableLayout, 0, 80, 45)).toMatchObject({
      kind: "table-cell",
      blockId: "table-1",
      cellId: "cell-1",
      lineIndex: -1,
    });
    expect(hitTestLayout(tableLayout, 0, 20, 20)).toMatchObject({
      kind: "table-cell",
      blockId: "table-1",
      cellId: "cell-1",
      lineIndex: 0,
    });
  });
});

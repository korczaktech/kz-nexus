import { describe, expect, it } from "vitest";
import { getLineXAtOffset, getOffsetAtLineX, hitTestLayout } from "./hitTesting";
import type { LayoutResult } from "./layout";

const textLine = {
  text: "hello",
  x: 10,
  y: 20,
  width: 50,
  height: 12,
  startOffset: 0,
  endOffset: 5,
  runs: [{ text: "hello", startOffset: 0, endOffset: 5, fontSize: 12, fontFamily: "Arial", marks: [], width: 50 }],
};

const baseLayout = {
  pages: [{
    index: 0, width: 600, height: 800,
    content: { x: 20, y: 20, width: 560, height: 760 },
    blocks: [{
      blockId: "paragraph-1", type: "paragraph", pageIndex: 0,
      rect: { x: 10, y: 18, width: 100, height: 20 }, lines: [textLine],
    }],
  }],
  pageCount: 1, diagnostics: [],
} as unknown as LayoutResult;

describe("SmartCanvas hit testing", () => {
  it("maps a pointer coordinate to a logical text position", () => {
    expect(hitTestLayout(baseLayout, 0, 35, 25)).toMatchObject({
      kind: "text", blockId: "paragraph-1", position: { blockId: "paragraph-1" }, lineIndex: 0,
    });
  });

  it("uses host text metrics to choose a caret offset", () => {
    expect(hitTestLayout(baseLayout, 0, 24, 25, { measureText: text => text.length * 10 }))
      .toMatchObject({ kind: "text", position: { blockId: "paragraph-1", offset: 1 } });
  });

  it("maps logical offsets to x coordinates and back using host font metrics", () => {
    const line = {
      text: "abcd",
      x: 10,
      y: 20,
      width: 40,
      height: 12,
      startOffset: 0,
      endOffset: 4,
      runs: [
        { text: "ab", startOffset: 0, endOffset: 2, fontSize: 12, fontFamily: "Arial", marks: [], width: 20 },
        { text: "cd", startOffset: 2, endOffset: 4, fontSize: 12, fontFamily: "Arial", marks: [], width: 20 },
      ],
    };
    const measure = (text: string) => text.length * 10;
    expect(getLineXAtOffset(line, 3, measure)).toBe(40);
    expect(getOffsetAtLineX(line, 39, measure)).toBe(3);
  });

  it("clamps caret mapping to the logical line range", () => {
    expect(getOffsetAtLineX(textLine, -100, text => text.length * 10)).toBe(0);
    expect(getOffsetAtLineX(textLine, 1000, text => text.length * 10)).toBe(5);
    expect(getLineXAtOffset(textLine, 100, text => text.length * 10)).toBe(60);
  });

  it("rejects invalid coordinates and missing pages", () => {
    expect(hitTestLayout(baseLayout, 1, 20, 20)).toBeUndefined();
    expect(hitTestLayout(baseLayout, 0, Number.NaN, 20)).toBeUndefined();
    expect(hitTestLayout(baseLayout, 0, 500, 700)).toBeUndefined();
  });

  it("can resolve a click outside text to the nearest block when requested", () => {
    expect(hitTestLayout(baseLayout, 0, 500, 700, { nearestBlock: true }))
      .toMatchObject({ kind: "block", blockId: "paragraph-1" });
  });

  it("keeps text hits more specific than the containing table cell", () => {
    const tableLayout = {
      ...baseLayout,
      pages: [{
        ...baseLayout.pages[0],
        blocks: [{
          blockId: "table-1", type: "table", pageIndex: 0,
          rect: { x: 0, y: 0, width: 200, height: 100 }, lines: [],
          table: { rows: [{
            rowId: "row-1", rect: { x: 0, y: 0, width: 200, height: 100 },
            cells: [{ cellId: "cell-1", rect: { x: 10, y: 10, width: 80, height: 40 }, lines: [{ ...textLine, x: 15, y: 15, width: 30 }] }],
          }] },
        }],
      }],
    } as unknown as LayoutResult;
    expect(hitTestLayout(tableLayout, 0, 20, 20)).toMatchObject({
      kind: "text", blockId: "table-1", lineIndex: 0,
    });
    expect(hitTestLayout(tableLayout, 0, 80, 45)).toMatchObject({
      kind: "table-cell", blockId: "table-1", cellId: "cell-1", lineIndex: -1,
    });
  });
  it("prioritizes semantic objects over the text line inside them", () => {
    const objectLayout = {
      ...baseLayout,
      pages: [{
        ...baseLayout.pages[0],
        blocks: [{ ...baseLayout.pages[0].blocks[0], object: true }],
      }],
    } as unknown as LayoutResult;
    expect(hitTestLayout(objectLayout, 0, 35, 25)).toMatchObject({
      kind: "block", blockId: "paragraph-1",
    });
  });


});

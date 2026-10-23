import { describe, expect, it } from "vitest";
import { getSelectionGeometry } from "./selectionGeometry";
import type { LayoutResult } from "./layout";
import type { Selection } from "../selection/selection";

const line = {
  text: "hello", x: 10, y: 20, width: 50, height: 12, startOffset: 0, endOffset: 5,
  runs: [{ text: "hello", startOffset: 0, endOffset: 5, fontSize: 12, fontFamily: "Arial", marks: [], width: 50 }],
};
const layout = {
  pages: [{
    index: 0, width: 600, height: 800,
    content: { x: 20, y: 20, width: 560, height: 760 },
    blocks: [{ blockId: "p1", type: "paragraph", pageIndex: 0, rect: { x: 10, y: 18, width: 100, height: 20 }, lines: [line] }],
  }],
  pageCount: 1, diagnostics: [],
} as unknown as LayoutResult;

const crossBlockLayout = {
  pages: [{
    index: 0, width: 600, height: 800,
    content: { x: 20, y: 20, width: 560, height: 760 },
    blocks: [
      { blockId: "p1", type: "paragraph", pageIndex: 0, rect: { x: 10, y: 18, width: 100, height: 20 }, lines: [line] },
      { blockId: "p2", type: "paragraph", pageIndex: 0, rect: { x: 10, y: 38, width: 100, height: 20 }, lines: [{ ...line, y: 40 }] },
    ],
  }],
  pageCount: 1, diagnostics: [],
} as unknown as LayoutResult;

function selection(anchor: number, focus: number, blockId = "p1"): Selection {
  return { anchor: { blockId, offset: anchor }, focus: { blockId, offset: focus } };
}

describe("SmartCanvas selection geometry", () => {
  it("derives caret geometry from logical selection and host font metrics", () => {
    expect(getSelectionGeometry(layout, 0, selection(2, 2), text => text.length * 10)).toEqual({
      caret: { x: 30, y: 20, height: 12 },
      selectionRects: [],
    });
  });

  it("derives a selection rectangle without accessing the DOM", () => {
    expect(getSelectionGeometry(layout, 0, selection(1, 4), text => text.length * 10)).toEqual({
      selectionRects: [{ x: 20, y: 20, width: 30, height: 12 }],
    });
  });

  it("normalizes a backwards selection", () => {
    expect(getSelectionGeometry(layout, 0, selection(4, 1), text => text.length * 10).selectionRects)
      .toEqual([{ x: 20, y: 20, width: 30, height: 12 }]);
  });

  it("renders logical selections spanning multiple blocks", () => {
    expect(getSelectionGeometry(crossBlockLayout, 0, {
      anchor: { blockId: "p1", offset: 2 },
      focus: { blockId: "p2", offset: 3 },
    }, text => text.length * 10).selectionRects).toEqual([
      { x: 30, y: 20, width: 30, height: 12 },
      { x: 10, y: 40, width: 30, height: 12 },
    ]);
  });

  it("places the caret on the next visual line at a soft-wrap boundary", () => {
    const wrappedLayout = {
      pages: [{
        index: 0, width: 600, height: 800,
        content: { x: 20, y: 20, width: 560, height: 760 },
        blocks: [{
          blockId: "wrapped",
          type: "paragraph",
          pageIndex: 0,
          rect: { x: 10, y: 18, width: 100, height: 32 },
          lines: [
            {
              text: "hello", x: 10, y: 20, width: 50, height: 12, startOffset: 0, endOffset: 6,
              runs: [{ text: "hello ", startOffset: 0, endOffset: 6, fontSize: 12, fontFamily: "Arial", marks: [], width: 60 }],
            },
            {
              text: "world", x: 10, y: 40, width: 50, height: 12, startOffset: 6, endOffset: 11,
              runs: [{ text: "world", startOffset: 6, endOffset: 11, fontSize: 12, fontFamily: "Arial", marks: [], width: 50 }],
            },
          ],
        }],
      }],
      pageCount: 1, diagnostics: [],
    } as unknown as LayoutResult;

    expect(getSelectionGeometry(wrappedLayout, 0, selection(6, 6, "wrapped"), text => text.length * 10)).toEqual({
      caret: { x: 10, y: 40, height: 12 },
      selectionRects: [],
    });
  });

  it("keeps the caret on the final line when the offset is at the document-line end", () => {
    expect(getSelectionGeometry(layout, 0, selection(5, 5), text => text.length * 10)).toEqual({
      caret: { x: 60, y: 20, height: 12 },
      selectionRects: [],
    });
  });

  it("returns empty geometry for absent or unavailable selections", () => {
    expect(getSelectionGeometry(layout, 0, undefined)).toEqual({ selectionRects: [] });
    expect(getSelectionGeometry(layout, 0, selection(1, 2, "missing"))).toEqual({ selectionRects: [] });
    expect(getSelectionGeometry(layout, 3, selection(1, 2))).toEqual({ selectionRects: [] });
  });
});

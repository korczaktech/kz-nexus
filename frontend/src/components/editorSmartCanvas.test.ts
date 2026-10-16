import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  collectSmartCanvasTextBlocks,
  findSmartCanvasTextMatches,
  getSmartCanvasTextSelectionRanges,
  dispatchSmartCanvasBeforeInput,
  getSmartCanvasDiagnostics,
  isProductionSmartCanvasEnabled,
  resetSmartCanvasDiagnostics,
} from "./editorSmartCanvas";

describe("production SmartCanvas migration gate", () => {
  beforeEach(() => resetSmartCanvasDiagnostics());

  it("stays disabled by default and only enables for the explicit query flag", () => {
    expect(isProductionSmartCanvasEnabled("")).toBe(false);
    expect(isProductionSmartCanvasEnabled("?other=1")).toBe(false);
    expect(isProductionSmartCanvasEnabled("?smartCanvas=0")).toBe(false);
    expect(isProductionSmartCanvasEnabled("?smartCanvas=1")).toBe(true);
    expect(isProductionSmartCanvasEnabled("?other=1&smartCanvas=1")).toBe(true);
  });


  it("includes text blocks nested inside tables and list containers in document order", () => {
    const content = [
      { type: "paragraph", id: "top", children: [{ text: "before" }] },
      { type: "table", id: "table", children: [
        { type: "tableRow", id: "row", children: [
          { type: "tableCell", id: "cell-a", children: [
            { type: "paragraph", id: "cell-paragraph", children: [{ text: "inside cell" }] },
            { type: "bulletList", id: "nested-list", children: [
              { type: "listItem", id: "item", children: [
                { type: "paragraph", id: "list-paragraph", children: [{ text: "nested list text" }] },
              ] },
            ] },
          ] },
        ] },
      ] },
      { type: "heading", id: "after", children: [{ text: "after" }] },
    ];
    expect(collectSmartCanvasTextBlocks(content).map(block => block.id)).toEqual([
      "top", "cell-paragraph", "list-paragraph", "after",
    ]);
  });


  it("finds case-insensitive matches in nested table and list paragraphs in document order", () => {
    const content = [
      { type: "paragraph", id: "top", children: [{ text: "Alpha alpha" }] },
      { type: "table", id: "table", children: [
        { type: "tableRow", id: "row", children: [
          { type: "tableCell", id: "cell", children: [
            { type: "paragraph", id: "cell-p", children: [{ text: "ALPHA" }] },
            { type: "bulletList", id: "list", children: [
              { type: "listItem", id: "item", children: [
                { type: "paragraph", id: "list-p", children: [{ text: "alpha beta alpha" }] },
              ] },
            ] },
          ] },
        ] },
      ] },
    ];
    expect(findSmartCanvasTextMatches(content, "alpha")).toEqual([
      { blockId: "top", start: 0, end: 5 },
      { blockId: "top", start: 6, end: 11 },
      { blockId: "cell-p", start: 0, end: 5 },
      { blockId: "list-p", start: 0, end: 5 },
      { blockId: "list-p", start: 11, end: 16 },
    ]);
    expect(findSmartCanvasTextMatches(content, "")).toEqual([]);
  });


  it("maps forward and reverse selections across table and list text without flattening containers", () => {
    const content = [
      { type: "paragraph", id: "first", children: [{ text: "Alpha" }] },
      { type: "table", id: "table", children: [
        { type: "tableRow", id: "row", children: [
          { type: "tableCell", id: "cell", children: [
            { type: "paragraph", id: "cell-p", children: [{ text: "Bravo" }] },
            { type: "bulletList", id: "list", children: [
              { type: "listItem", id: "item", children: [
                { type: "paragraph", id: "list-p", children: [{ text: "Charlie" }] },
              ] },
            ] },
          ] },
        ] },
      ] },
      { type: "paragraph", id: "last", children: [{ text: "Delta" }] },
    ];
    const forward = getSmartCanvasTextSelectionRanges(content, {
      anchor: { blockId: "first", offset: 2 }, focus: { blockId: "last", offset: 3 },
    });
    expect(forward?.map(range => [range.block.id, range.start, range.end])).toEqual([
      ["first", 2, 5], ["cell-p", 0, 5], ["list-p", 0, 7], ["last", 0, 3],
    ]);
    const reverse = getSmartCanvasTextSelectionRanges(content, {
      anchor: { blockId: "last", offset: 3 }, focus: { blockId: "first", offset: 2 },
    });
    expect(reverse?.map(range => [range.block.id, range.start, range.end])).toEqual([
      ["first", 2, 5], ["cell-p", 0, 5], ["list-p", 0, 7], ["last", 0, 3],
    ]);
    expect(getSmartCanvasTextSelectionRanges(content, {
      anchor: { blockId: "missing", offset: 0 }, focus: { blockId: "last", offset: 1 },
    })).toBeNull();
  });

  it("keeps diagnostic counters isolated and returns a snapshot", () => {
    const snapshot = getSmartCanvasDiagnostics();
    expect(snapshot).toEqual({ reads: 0, successfulReads: 0, failedReads: 0, restores: 0, beforeInputEvents: 0, compositionDeferredEvents: 0 });
    resetSmartCanvasDiagnostics();
    expect(getSmartCanvasDiagnostics()).toEqual(snapshot);
  });

  it("routes beforeinput through the adapter and records IME deferrals without swallowing events", () => {
    const handler = vi.fn();
    const ordinary = { nativeEvent: { inputType: "insertText", isComposing: false } as InputEvent, preventDefault: vi.fn() };
    const composing = { nativeEvent: { inputType: "insertCompositionText", isComposing: true } as InputEvent, preventDefault: vi.fn() };

    dispatchSmartCanvasBeforeInput(ordinary, handler, false);
    dispatchSmartCanvasBeforeInput(composing, handler, true);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenNthCalledWith(1, ordinary);
    expect(handler).toHaveBeenNthCalledWith(2, composing);
    expect(ordinary.preventDefault).not.toHaveBeenCalled();
    expect(composing.preventDefault).not.toHaveBeenCalled();
    expect(getSmartCanvasDiagnostics()).toMatchObject({ beforeInputEvents: 2, compositionDeferredEvents: 1 });
  });

});

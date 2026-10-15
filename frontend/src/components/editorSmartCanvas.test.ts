import { beforeEach, describe, expect, it, vi } from "vitest";
import {
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

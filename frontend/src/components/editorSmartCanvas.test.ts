import { beforeEach, describe, expect, it } from "vitest";
import {
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
    expect(snapshot).toEqual({ reads: 0, successfulReads: 0, failedReads: 0, restores: 0 });
    resetSmartCanvasDiagnostics();
    expect(getSmartCanvasDiagnostics()).toEqual(snapshot);
  });
});

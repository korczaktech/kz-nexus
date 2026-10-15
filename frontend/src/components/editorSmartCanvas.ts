import type { createEditor } from "../../../packages/engine/src/index";
import { getEngineDomContext, restoreEngineDomSelection } from "../services/nexusEngineAdapter";

type EngineInstance = ReturnType<typeof createEditor>;

export type SmartCanvasSelectionContext = NonNullable<ReturnType<typeof getEngineDomContext>>;

export type SmartCanvasDiagnostics = {
  reads: number;
  successfulReads: number;
  failedReads: number;
  restores: number;
};

const diagnostics: SmartCanvasDiagnostics = {
  reads: 0,
  successfulReads: 0,
  failedReads: 0,
  restores: 0,
};

/**
 * Opt-in integration gate for the production editor.
 * Enable with ?smartCanvas=1. It deliberately defaults off until the full
 * keyboard/IME/clipboard/pagination regression suite is complete.
 */
export function isProductionSmartCanvasEnabled(search?: string): boolean {
  const query = search ?? (typeof window !== "undefined" ? window.location.search : "");
  return new URLSearchParams(query).get("smartCanvas") === "1";
}

/**
 * Selection boundary for the production SmartCanvas migration.
 * It currently delegates to the proven DOM-to-model adapter; this creates one
 * explicit seam for replacing DOM selection with the logical selection model
 * without duplicating or taking ownership of the Nexus document.
 */
export function readSmartCanvasSelection(
  engine: EngineInstance,
  root: HTMLElement,
): SmartCanvasSelectionContext | null {
  diagnostics.reads += 1;
  const context = getEngineDomContext(engine, root);
  if (context) diagnostics.successfulReads += 1;
  else diagnostics.failedReads += 1;
  return context;
}

export function restoreSmartCanvasSelection(engine: EngineInstance, root: HTMLElement): void {
  diagnostics.restores += 1;
  restoreEngineDomSelection(engine, root);
}

export function getSmartCanvasDiagnostics(): Readonly<SmartCanvasDiagnostics> {
  return { ...diagnostics };
}

/** Test-only reset to keep instrumentation isolated between cases. */
export function resetSmartCanvasDiagnostics(): void {
  diagnostics.reads = 0;
  diagnostics.successfulReads = 0;
  diagnostics.failedReads = 0;
  diagnostics.restores = 0;
}

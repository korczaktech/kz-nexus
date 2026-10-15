import { afterEach, describe, expect, it } from "vitest";
import type { Selection } from "@korczak/nexus-engine";
import { SmartCanvasSurface } from "../src/editor/smartcanvas";
import { PreviewController } from "../src/services/controller";

const originalDocument = globalThis.document;

function fakeRoot(): HTMLElement {
  return {
    focus() {},
    contains() { return false; },
    replaceChildren() {},
  } as unknown as HTMLElement;
}

afterEach(() => {
  if (originalDocument === undefined) {
    Reflect.deleteProperty(globalThis, "document");
  } else {
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
  }
});

describe("SmartCanvasSurface", () => {
  it("renders model changes and releases input and subscription on dispose", () => {
    Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: null } });
    const controller = new PreviewController();
    const root = fakeRoot();
    const renders: string[] = [];
    let attachCount = 0;
    let detachCount = 0;
    const surface = new SmartCanvasSurface(root, controller, {
      renderer: {
        render: (doc) => { renders.push(doc.content[0]?.id ?? "empty"); },
      },
      selection: {
        read: () => controller.selection,
        write: () => true,
      },
      input: {
        attach: () => {
          attachCount += 1;
          return () => { detachCount += 1; };
        },
      },
    });

    expect(renders).toHaveLength(1);
    expect(attachCount).toBe(1);
    controller.insertText("A");
    expect(renders).toHaveLength(2);
    surface.refresh();
    expect(renders).toHaveLength(2);

    surface.dispose();
    expect(detachCount).toBe(1);
    const renderCount = renders.length;
    controller.insertText("B");
    expect(renders).toHaveLength(renderCount);
  });

  it("keeps selection as a logical engine value passed through the adapter", () => {
    Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: null } });
    const controller = new PreviewController();
    const root = fakeRoot();
    const written: Array<Selection | undefined> = [];
    const surface = new SmartCanvasSurface(root, controller, {
      renderer: { render: () => undefined },
      selection: {
        read: () => undefined,
        write: (_root, selection) => { written.push(selection); return true; },
      },
      input: { attach: () => () => undefined },
    });

    controller.insertText("abc");
    expect(written.length).toBeGreaterThan(0);
    expect(controller.selection?.focus.offset).toBe(3);
    surface.dispose();
  });
});

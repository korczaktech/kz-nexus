// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDocument, createEditor, getPlainText } from "../../../packages/engine/src/index";
import type { NexusDocument, SmartCanvasHitTarget } from "../../../packages/engine/src/index";
import { SmartCanvasPreview } from "./SmartCanvasPreview";

vi.mock("./CanvasDocumentRenderer", () => ({
  CanvasDocumentRenderer: ({
    document,
    onHitTest,
  }: {
    document: NexusDocument;
    onHitTest?: (target: SmartCanvasHitTarget, clickCount?: number) => void;
  }) => {
    const block = document.content[0];
    return createElement("button", {
      type: "button",
      "data-testid": "smartcanvas-text-hit",
      onClick: () => {
        if (block?.type === "paragraph" || block?.type === "heading") {
          onHitTest?.({
            kind: "text",
            pageIndex: 0,
            blockId: block.id,
            position: { blockId: block.id, offset: 0 },
            lineIndex: 0,
          }, 1);
        }
      },
    }, "Select text");
  },
}));

describe("SmartCanvasPreview input integration", () => {
  let host: HTMLDivElement | undefined;
  let root: ReturnType<typeof createRoot> | undefined;
  let engine: ReturnType<typeof createEditor> | undefined;

  afterEach(async () => {
    if (root) await act(async () => { root?.unmount(); });
    engine?.dispose();
    host?.remove();
    host = undefined;
    root = undefined;
    engine = undefined;
  });

  it("routes text input, undo, and redo through the canonical engine session", async () => {
    const document = createDocument({ title: "SmartCanvas input integration" });
    engine = createEditor({ document });
    const onDocumentChange = vi.fn();
    host = window.document.createElement("div");
    window.document.body.append(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(createElement(SmartCanvasPreview, {
        document: engine!.getDocument(),
        engine: engine!,
        onDocumentChange,
      }));
    });

    const hit = host.querySelector('[data-testid="smartcanvas-text-hit"]') as HTMLButtonElement | null;
    expect(hit).not.toBeNull();
    await act(async () => { hit?.click(); });

    const input = host.querySelector('textarea[aria-label="Entrada de texto do SmartCanvas"]') as HTMLTextAreaElement | null;
    expect(input).not.toBeNull();
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    if (!input || !valueSetter) throw new Error("SmartCanvas input surface was not mounted");
    await act(async () => {
      valueSetter.call(input, "Olá SmartCanvas 😀");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const paragraph = engine.getDocument().content[0];
    if (!paragraph || paragraph.type !== "paragraph") throw new Error("Expected canonical paragraph");
    expect(getPlainText(paragraph)).toBe("Olá SmartCanvas 😀");
    expect(onDocumentChange).toHaveBeenCalled();

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true }));
    });
    const undone = engine.getDocument().content[0];
    if (!undone || undone.type !== "paragraph") throw new Error("Expected paragraph after undo");
    expect(getPlainText(undone)).toBe("");

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "y", ctrlKey: true, bubbles: true, cancelable: true }));
    });
    const redone = engine.getDocument().content[0];
    if (!redone || redone.type !== "paragraph") throw new Error("Expected paragraph after redo");
    expect(getPlainText(redone)).toBe("Olá SmartCanvas 😀");
  });
});

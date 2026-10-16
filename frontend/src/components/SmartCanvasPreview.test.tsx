// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDocument, createEditor, getPlainText, insertImageResource, insertTable } from "../../../packages/engine/src/index";
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
    return createElement("div", null,
      createElement("button", {
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
      }, "Select text"),
      ...document.content.filter(item => item.type === "image").map(item => createElement("button", {
        key: item.id,
        type: "button",
        "data-testid": "smartcanvas-image-hit",
        onClick: () => onHitTest?.({ kind: "block", pageIndex: 0, blockId: item.id }, 1),
      }, "Select image")),
      ...document.content.filter(item => item.type === "table").flatMap(table =>
        table.children.flatMap(row => row.children.map(cell => createElement("button", {
          key: cell.id,
          type: "button",
          "data-testid": "smartcanvas-cell-hit",
          onClick: () => onHitTest?.({
            kind: "table-cell",
            pageIndex: 0,
            blockId: table.id,
            cellId: cell.id,
            offset: 0,
            lineIndex: 0,
          }, 1),
        }, "Select cell"))),
      ),
    );
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

    await act(async () => {
      input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" }));
      valueSetter.call(input, "日本語");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const duringComposition = engine.getDocument().content[0];
    if (!duringComposition || duringComposition.type !== "paragraph") throw new Error("Expected paragraph during composition");
    expect(getPlainText(duringComposition)).toBe("Olá SmartCanvas 😀");

    await act(async () => {
      input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "日本語" }));
    });
    const afterComposition = engine.getDocument().content[0];
    if (!afterComposition || afterComposition.type !== "paragraph") throw new Error("Expected paragraph after composition");
    expect(getPlainText(afterComposition)).toBe("Olá SmartCanvas 😀日本語");
  });
  it("selects an image and applies validated properties through the engine", async () => {
    const document = createDocument({ title: "SmartCanvas image integration" });
    engine = createEditor({ document });
    const paragraph = engine.getDocument().content[0];
    if (!paragraph || paragraph.type !== "paragraph") throw new Error("Expected initial paragraph");
    const inserted = engine.exec([insertImageResource({
      afterBlockId: paragraph.id,
      mimeType: "image/png",
      data: "iVBORw0KGgo=",
      alt: "Old alt",
      name: "test.png",
    })]);
    expect(inserted.ok).toBe(true);
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
    const imageHit = host.querySelector('[data-testid="smartcanvas-image-hit"]') as HTMLButtonElement | null;
    expect(imageHit).not.toBeNull();
    await act(async () => { imageHit?.click(); });

    const alt = host.querySelector('input[aria-label="Texto alternativo da imagem"]') as HTMLInputElement | null;
    const width = host.querySelector('input[aria-label="Largura da imagem em pixels"]') as HTMLInputElement | null;
    const height = host.querySelector('input[aria-label="Altura da imagem em pixels"]') as HTMLInputElement | null;
    const apply = [...host.querySelectorAll("button")].find(button => button.textContent === "Aplicar");
    expect(alt).not.toBeNull();
    expect(width).not.toBeNull();
    expect(height).not.toBeNull();
    expect(apply).toBeDefined();
    if (!alt || !width || !height || !apply) throw new Error("Image properties UI did not mount");

    const setValue = (element: HTMLInputElement, value: string) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (!setter) throw new Error("Input value setter unavailable");
      setter.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    };
    await act(async () => {
      setValue(alt, "Accessible logo");
      setValue(width, "128");
      setValue(height, "64");
    });
    await act(async () => { apply.click(); });

    const image = engine.getDocument().content.find(item => item.type === "image");
    expect(image?.type).toBe("image");
    if (!image || image.type !== "image") throw new Error("Expected canonical image block");
    expect(image.alt).toBe("Accessible logo");
    expect(image.width).toBe(128);
    expect(image.height).toBe(64);
    expect(onDocumentChange).toHaveBeenCalled();
  });

  it("edits a table cell and creates a row when Tab leaves the final cell", async () => {
    const document = createDocument({ title: "SmartCanvas table integration" });
    engine = createEditor({ document });
    const paragraph = engine.getDocument().content[0];
    if (!paragraph || paragraph.type !== "paragraph") throw new Error("Expected initial paragraph");
    expect(engine.exec([insertTable({ afterBlockId: paragraph.id, rows: 1, columns: 1 })]).ok).toBe(true);
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
    const cellHit = host.querySelector('[data-testid="smartcanvas-cell-hit"]') as HTMLButtonElement | null;
    expect(cellHit).not.toBeNull();
    await act(async () => { cellHit?.click(); });
    const input = host.querySelector('textarea[aria-label="Entrada de texto do SmartCanvas"]') as HTMLTextAreaElement | null;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    if (!input || !setter) throw new Error("SmartCanvas input surface was not mounted");
    await act(async () => {
      setter.call(input, "Cell text 😀");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const tableAfterText = engine.getDocument().content.find(item => item.type === "table");
    if (!tableAfterText || tableAfterText.type !== "table") throw new Error("Expected table after cell edit");
    const firstCell = tableAfterText.children[0]?.children[0];
    const firstParagraph = firstCell?.children[0];
    if (!firstParagraph || firstParagraph.type !== "paragraph") throw new Error("Expected paragraph in edited cell");
    expect(getPlainText(firstParagraph)).toBe("Cell text 😀");

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    });
    const tableAfterTab = engine.getDocument().content.find(item => item.type === "table");
    if (!tableAfterTab || tableAfterTab.type !== "table") throw new Error("Expected table after Tab");
    expect(tableAfterTab.children).toHaveLength(2);
    expect(onDocumentChange).toHaveBeenCalled();
  });

});

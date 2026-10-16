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
      ...document.content.slice(1).filter(item => item.type === "paragraph" || item.type === "heading").map(item => createElement("button", {
        key: item.id,
        type: "button",
        "data-testid": "smartcanvas-additional-text-hit",
        onClick: () => onHitTest?.({
          kind: "text",
          pageIndex: 0,
          blockId: item.id,
          position: { blockId: item.id, offset: 0 },
          lineIndex: 0,
        }, 1),
      }, "Select additional text")),
      ...document.content.filter(item => item.type === "image").map(item => createElement("button", {
        key: item.id,
        type: "button",
        "data-testid": "smartcanvas-image-hit",
        onClick: () => onHitTest?.({ kind: "block", pageIndex: 0, blockId: item.id }, 1),
      }, "Select image")),
      ...document.content.filter(item => item.type === "paragraph" && item.editorObject).map(item => createElement("button", {
        key: item.id,
        type: "button",
        "data-testid": "smartcanvas-object-hit",
        onClick: () => onHitTest?.({ kind: "block", pageIndex: 0, blockId: item.id }, 1),
      }, "Select object")),
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
  it("replaces a cross-block selection as one undoable structural edit", async () => {
    const document = createDocument({ title: "SmartCanvas cross-block edit" });
    const first = document.content[0];
    if (!first || first.type !== "paragraph") throw new Error("Expected initial paragraph");
    first.children[0]!.text = "Alpha";
    document.content.push({
      type: "paragraph",
      id: "secondparagraph",
      children: [{ type: "text", id: "secondrun", text: "Beta", marks: [] }],
    });
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
    const input = host.querySelector('textarea[aria-label="Entrada de texto do SmartCanvas"]') as HTMLTextAreaElement | null;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    if (!input || !setter) throw new Error("SmartCanvas input surface was not mounted");
    await act(async () => { hit?.click(); });
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true, cancelable: true }));
      setter.call(input, "Merged");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const edited = engine.getDocument();
    expect(edited.content).toHaveLength(1);
    const merged = edited.content[0];
    if (!merged || merged.type !== "paragraph") throw new Error("Expected merged paragraph");
    expect(getPlainText(merged)).toBe("Merged");
    expect(onDocumentChange).toHaveBeenCalled();

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true }));
    });
    const undone = engine.getDocument();
    expect(undone.content).toHaveLength(2);
    expect(getPlainText(undone.content[0] as Extract<NexusDocument["content"][number], { type: "paragraph" }>)).toBe("Alpha");
    expect(getPlainText(undone.content[1] as Extract<NexusDocument["content"][number], { type: "paragraph" }>)).toBe("Beta");
  });

  it("deletes a selected semantic object through the engine without targeting adjacent text", async () => {
    const document = createDocument({ title: "SmartCanvas object deletion" });
    const objectParagraph = document.content[0];
    if (!objectParagraph || objectParagraph.type !== "paragraph") throw new Error("Expected initial paragraph");
    objectParagraph.children[0]!.text = "Shape text";
    objectParagraph.editorObject = {
      kind: "shape",
      shape: "rectangle",
      label: "Test shape",
      fill: "#ffffff",
      stroke: "#111827",
      width: 120,
      height: 60,
    };
    document.content.push({
      type: "paragraph",
      id: "adjacenttext",
      children: [{ type: "text", id: "adjacentrun", text: "Keep me", marks: [] }],
    });
    engine = createEditor({ document });
    const onDocumentChange = vi.fn();
    const onStatus = vi.fn();
    host = window.document.createElement("div");
    window.document.body.append(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(createElement(SmartCanvasPreview, {
        document: engine!.getDocument(),
        engine: engine!,
        onDocumentChange,
        onStatus,
      }));
    });
    const objectHit = host.querySelector('[data-testid="smartcanvas-object-hit"]') as HTMLButtonElement | null;
    const input = host.querySelector('textarea[aria-label="Entrada de texto do SmartCanvas"]') as HTMLTextAreaElement | null;
    expect(objectHit).not.toBeNull();
    if (!input) throw new Error("SmartCanvas input surface was not mounted");
    await act(async () => { objectHit?.click(); });
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true }));
    });

    expect(onStatus).toHaveBeenLastCalledWith("Bloco removido.");
    const result = engine.getDocument();
    expect(result.content.some(block => block.id === objectParagraph.id)).toBe(false);
    expect(result.content.some(block => block.id === "adjacenttext")).toBe(true);
    expect(getPlainText(result.content.find(block => block.id === "adjacent-text") as Extract<NexusDocument["content"][number], { type: "paragraph" }>)).toBe("Keep me");
    expect(onDocumentChange).toHaveBeenCalled();
  });

  it("pastes sanitized rich HTML and preserves inline formatting in the engine model", async () => {
    const document = createDocument({ title: "SmartCanvas rich paste" });
    engine = createEditor({ document });
    const onDocumentChange = vi.fn();
    const onStatus = vi.fn();
    host = window.document.createElement("div");
    window.document.body.append(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(createElement(SmartCanvasPreview, {
        document: engine!.getDocument(),
        engine: engine!,
        onDocumentChange,
        onStatus,
      }));
    });
    const hit = host.querySelector('[data-testid="smartcanvas-text-hit"]') as HTMLButtonElement | null;
    await act(async () => { hit?.click(); });
    const input = host.querySelector('textarea[aria-label="Entrada de texto do SmartCanvas"]') as HTMLTextAreaElement | null;
    if (!input) throw new Error("SmartCanvas input surface was not mounted");

    const html = '<p><strong>Rich</strong> <em>paste</em> <a href="javascript:alert(1)">safe text</a></p><script>window.__pasteAttack = true</script>';
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", {
      value: { getData: (type: string) => type === "text/html" ? html : "Rich paste safe text" },
    });
    await act(async () => { input.dispatchEvent(paste); });

    const paragraph = engine.getDocument().content[0];
    if (!paragraph || paragraph.type !== "paragraph") throw new Error("Expected canonical paragraph after paste");
    expect(getPlainText(paragraph)).toContain("Rich paste safe text");
    expect(paragraph.children.some(run => run.text.includes("Rich") && run.marks.some(mark => mark.type === "bold"))).toBe(true);
    expect(paragraph.children.some(run => run.text.includes("paste") && run.marks.some(mark => mark.type === "italic"))).toBe(true);
    expect(paragraph.children.some(run => run.marks.some(mark => mark.type === "link" && mark.value.startsWith("javascript:")))).toBe(false);
    expect(onDocumentChange).toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith("Conteúdo formatado colado com sanitização.");
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

    const input = host.querySelector('textarea[aria-label="Entrada de texto do SmartCanvas"]') as HTMLTextAreaElement | null;
    if (!input) throw new Error("SmartCanvas input surface was not mounted");
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true }));
    });
    expect(engine.getDocument().content.some(block => block.type === "image")).toBe(false);
    expect(engine.getDocument().resources).toHaveLength(0);
  });

  it("defers intermediate IME input and commits the composed text once", async () => {
    const document = createDocument({ title: "SmartCanvas IME integration" });
    engine = createEditor({ document });
    host = window.document.createElement("div");
    window.document.body.append(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(createElement(SmartCanvasPreview, {
        document: engine!.getDocument(),
        engine: engine!,
        onDocumentChange: vi.fn(),
      }));
    });
    const hit = host.querySelector('[data-testid="smartcanvas-text-hit"]') as HTMLButtonElement | null;
    await act(async () => { hit?.click(); });
    const input = host.querySelector('textarea[aria-label="Entrada de texto do SmartCanvas"]') as HTMLTextAreaElement | null;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    if (!input || !setter) throw new Error("SmartCanvas input surface was not mounted");

    await act(async () => {
      input.dispatchEvent(new Event("compositionstart", { bubbles: true }));
      setter.call(input, "にほん");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const intermediate = engine.getDocument().content[0];
    if (!intermediate || intermediate.type !== "paragraph") throw new Error("Expected paragraph during composition");
    expect(getPlainText(intermediate)).toBe("");

    await act(async () => {
      input.dispatchEvent(new Event("compositionend", { bubbles: true }));
    });
    const committed = engine.getDocument().content[0];
    if (!committed || committed.type !== "paragraph") throw new Error("Expected paragraph after composition");
    expect(getPlainText(committed)).toBe("にほん");
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
    await act(async () => {
      input?.dispatchEvent(new KeyboardEvent("keydown", { key: "b", ctrlKey: true, bubbles: true, cancelable: true }));
    });
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
    expect(firstParagraph.children[0]?.marks).toContainEqual({ type: "bold" });

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    });
    const tableAfterTab = engine.getDocument().content.find(item => item.type === "table");
    if (!tableAfterTab || tableAfterTab.type !== "table") throw new Error("Expected table after Tab");
    expect(tableAfterTab.children).toHaveLength(2);
    expect(onDocumentChange).toHaveBeenCalled();
  });

});

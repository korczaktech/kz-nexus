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

  it("initializes a logical insertion point without requiring a prior text hit", async () => {
    const document = createDocument({ title: "SmartCanvas initial selection" });
    const first = document.content[0];
    if (!first || first.type !== "paragraph") throw new Error("Expected initial paragraph");
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

    expect(engine.getSelection()).toEqual({
      anchor: { blockId: first.id, offset: 0 },
      focus: { blockId: first.id, offset: 0 },
    });
  });

  it("creates a bulleted list through the canonical SmartCanvas engine", async () => {
    const document = createDocument({ title: "SmartCanvas list creation" });
    const first = document.content[0];
    if (!first || first.type !== "paragraph") throw new Error("Expected initial paragraph");
    first.children[0]!.text = "List item";
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
    const listButton = host.querySelector('[aria-label="Lista com marcadores SmartCanvas"]') as HTMLButtonElement | null;
    if (!listButton) throw new Error("SmartCanvas list control was not mounted");
    await act(async () => { listButton.click(); });

    const list = engine.getDocument().content[0];
    expect(list?.type).toBe("bulletList");
    if (!list || list.type !== "bulletList") throw new Error("Expected canonical bulleted list");
    expect(list.children[0]?.children[0]?.type).toBe("paragraph");
    expect(onDocumentChange).toHaveBeenCalled();
  });

  it("inserts a table through the canonical SmartCanvas engine", async () => {
    const document = createDocument({ title: "SmartCanvas table insertion" });
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
    const insert = host.querySelector('[aria-label="Inserir tabela SmartCanvas"]') as HTMLButtonElement | null;
    if (!insert) throw new Error("SmartCanvas table insertion control was not mounted");
    await act(async () => { insert.click(); });

    const table = engine.getDocument().content.find(block => block.type === "table");
    if (!table || table.type !== "table") throw new Error("Expected canonical table");
    expect(table.children).toHaveLength(3);
    expect(table.children.every(row => row.children.length === 3)).toBe(true);
    expect(onDocumentChange).toHaveBeenCalled();
    expect(onStatus).toHaveBeenLastCalledWith("Tabela 3×3 inserida pelo motor. Use Tab para navegar e criar novas linhas.");
  });

  it("applies formatting and paragraph alignment through SmartCanvas controls", async () => {
    const document = createDocument({ title: "SmartCanvas formatting controls" });
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

    const bold = host.querySelector('[aria-label="Negrito SmartCanvas"]') as HTMLButtonElement | null;
    const center = host.querySelector('[aria-label="Centralizar SmartCanvas"]') as HTMLButtonElement | null;
    const input = host.querySelector('textarea[aria-label="Entrada de texto do SmartCanvas"]') as HTMLTextAreaElement | null;
    if (!bold || !center || !input) throw new Error("SmartCanvas formatting controls were not mounted");
    await act(async () => { bold.click(); });
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    if (!setter) throw new Error("Textarea value setter was not available");
    await act(async () => {
      setter.call(input, "Bold text");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const paragraph = engine.getDocument().content[0];
    if (!paragraph || paragraph.type !== "paragraph") throw new Error("Expected formatted paragraph");
    expect(paragraph.children.some(run => run.text === "Bold text" && run.marks.some(mark => mark.type === "bold"))).toBe(true);

    await act(async () => { center.click(); });
    const centered = engine.getDocument().content[0];
    if (!centered || centered.type !== "paragraph") throw new Error("Expected centered paragraph");
    expect(centered.align).toBe("center");

    const indent = host.querySelector('[aria-label="Aumentar recuo SmartCanvas"]') as HTMLButtonElement | null;
    const spacing = host.querySelector('[aria-label="Aplicar espaçamento SmartCanvas"]') as HTMLButtonElement | null;
    if (!indent || !spacing) throw new Error("SmartCanvas paragraph layout controls were not mounted");
    await act(async () => { indent.click(); });
    const indented = engine.getDocument().content[0];
    if (!indented || indented.type !== "paragraph") throw new Error("Expected indented paragraph");
    expect(indented.indent).toBe(18);
    await act(async () => { spacing.click(); });
    const spaced = engine.getDocument().content[0];
    if (!spaced || spaced.type !== "paragraph") throw new Error("Expected spaced paragraph");
    expect(spaced.lineSpacing).toBe(1.2);
    expect(spaced.spacingAfter).toBe(8);
    expect(onDocumentChange).toHaveBeenCalled();
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
  it("replaces a cross-block selection with rich content as one undoable structural edit", async () => {
    const document = createDocument({ title: "SmartCanvas cross-block edit" });
    const first = document.content[0];
    if (!first || first.type !== "paragraph") throw new Error("Expected initial paragraph");
    first.children[0]!.text = "Alpha";
    document.content.push({
      type: "paragraph",
      id: "second_para0001",
      children: [{ type: "text", id: "second_run0001", text: "Beta", marks: [] }],
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
    if (!input) throw new Error("SmartCanvas input surface was not mounted");
    await act(async () => { hit?.click(); });
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true, cancelable: true }));
      const paste = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(paste, "clipboardData", {
        value: { getData: (type: string) => type === "text/html" ? "<p><strong>Merged</strong></p>" : "Merged" },
      });
      input.dispatchEvent(paste);
    });

    const edited = engine.getDocument();
    expect(edited.content).toHaveLength(1);
    const merged = edited.content[0];
    if (!merged || merged.type !== "paragraph") throw new Error("Expected merged paragraph");
    expect(getPlainText(merged)).toBe("Merged");
    expect(merged.children.some(run => run.marks.some(mark => mark.type === "bold"))).toBe(true);
    expect(onDocumentChange).toHaveBeenCalled();

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true }));
    });
    const undone = engine.getDocument();
    expect(undone.content).toHaveLength(2);
    expect(getPlainText(undone.content[0] as Extract<NexusDocument["content"][number], { type: "paragraph" }>)).toBe("Alpha");
    expect(getPlainText(undone.content[1] as Extract<NexusDocument["content"][number], { type: "paragraph" }>)).toBe("Beta");
  });

  it("edits and reorders a selected semantic object through engine commands", async () => {
    const document = createDocument({ title: "SmartCanvas object properties" });
    const objectParagraph = document.content[0];
    if (!objectParagraph || objectParagraph.type !== "paragraph") throw new Error("Expected initial paragraph");
    objectParagraph.children[0]!.text = "Shape body";
    objectParagraph.editorObject = {
      kind: "shape",
      shape: "rectangle",
      label: "Before",
      fill: "#ffffff",
      stroke: "#111827",
      width: 120,
      height: 60,
    };
    document.content.push({
      type: "paragraph",
      id: "objectpara_0001",
      children: [{ type: "text", id: "objectrun_0002", text: "Neighbor", marks: [] }],
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
    if (!objectHit) throw new Error("Object hit target was not mounted");
    await act(async () => { objectHit.click(); });

    const widthInput = host.querySelector('[aria-label="Largura do objeto em pontos"]') as HTMLInputElement | null;
    const labelInput = host.querySelector('[aria-label="Rótulo do objeto"]') as HTMLInputElement | null;
    if (!widthInput || !labelInput) throw new Error("Object property controls were not mounted");
    const widthSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!widthSetter) throw new Error("Input value setter was not available");
    await act(async () => {
      widthSetter.call(widthInput, "180");
      widthInput.dispatchEvent(new Event("input", { bubbles: true }));
      widthInput.dispatchEvent(new Event("change", { bubbles: true }));
      widthSetter.call(labelInput, "Updated shape");
      labelInput.dispatchEvent(new Event("input", { bubbles: true }));
      labelInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const applyButton = [...host.querySelectorAll('[aria-label="Propriedades do objeto selecionado"] button')][0] as HTMLButtonElement | undefined;
    if (!applyButton) throw new Error("Object apply button was not mounted");
    await act(async () => { applyButton.click(); });

    const updated = engine.getDocument().content[0];
    if (!updated || updated.type !== "paragraph") throw new Error("Expected edited object paragraph");
    expect(updated.editorObject?.width, JSON.stringify(onStatus.mock.calls)).toBe(180);
    expect(updated.editorObject?.label).toBe("Updated shape");

    const moveDown = [...host.querySelectorAll('[aria-label="Propriedades do objeto selecionado"] button')].find(button => button.textContent === "Mover para baixo") as HTMLButtonElement | undefined;
    if (!moveDown) throw new Error("Object move control was not mounted");
    await act(async () => { moveDown.click(); });
    expect(engine.getDocument().content[1]?.id).toBe(objectParagraph.id);
    expect(onDocumentChange).toHaveBeenCalled();
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
      id: "adjacent_text0001",
      children: [{ type: "text", id: "adjacent_run0001", text: "Keep me", marks: [] }],
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
    expect(result.content.some(block => block.id === "adjacent_text0001")).toBe(true);
    expect(getPlainText(result.content.find(block => block.id === "adjacent_text0001") as Extract<NexusDocument["content"][number], { type: "paragraph" }>)).toBe("Keep me");
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

  it("pastes an image resource into the canonical document", async () => {
    const document = createDocument({ title: "SmartCanvas image paste" });
    const first = document.content[0];
    if (!first || first.type !== "paragraph") throw new Error("Expected initial paragraph");
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
    const input = host.querySelector('textarea[aria-label="Entrada de texto do SmartCanvas"]') as HTMLTextAreaElement | null;
    if (!input) throw new Error("SmartCanvas input surface was not mounted");
    const file = new File(["small-image-fixture"], "pasted.png", { type: "image/png" });
    const readerSpy = vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(function (this: FileReader) {
      Object.defineProperty(this, "result", { configurable: true, value: "data:image/png;base64,c21hbGwtaW1hZ2UtZml4dHVyZQ==" });
      this.onload?.call(this, new ProgressEvent("load") as ProgressEvent<FileReader>);
    });
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", {
      value: {
        items: [{ kind: "file", getAsFile: () => file }],
        files: [file],
        getData: () => "",
      },
    });

    await act(async () => {
      input.dispatchEvent(paste);
      await Promise.resolve();
      await Promise.resolve();
    });
    readerSpy.mockRestore();

    const result = engine.getDocument();
    const image = result.content.find(block => block.type === "image");
    expect(image?.type, JSON.stringify(onStatus.mock.calls)).toBe("image");
    expect(result.resources.some(resource => resource.kind === "image" && resource.name === "pasted.png")).toBe(true);
    expect(onDocumentChange).toHaveBeenCalled();
    expect(onStatus).toHaveBeenLastCalledWith("Imagem colada e incorporada ao documento pelo SmartCanvas.");
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

  it("pastes rich inline formatting into a table cell without flattening marks", async () => {
    const document = createDocument({ title: "SmartCanvas rich cell paste" });
    engine = createEditor({ document });
    const paragraph = engine.getDocument().content[0];
    if (!paragraph || paragraph.type !== "paragraph") throw new Error("Expected initial paragraph");
    expect(engine.exec([insertTable({ afterBlockId: paragraph.id, rows: 1, columns: 1 })]).ok).toBe(true);
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
    const cellHit = host.querySelector('[data-testid="smartcanvas-cell-hit"]') as HTMLButtonElement | null;
    await act(async () => { cellHit?.click(); });
    const input = host.querySelector('textarea[aria-label="Entrada de texto do SmartCanvas"]') as HTMLTextAreaElement | null;
    if (!input) throw new Error("SmartCanvas input surface was not mounted");
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", {
      value: { getData: (type: string) => type === "text/html" ? "<p><strong>Bold</strong></p><p><em>italic</em></p>" : "Bold\nitalic" },
    });
    await act(async () => { input.dispatchEvent(paste); });

    const table = engine.getDocument().content.find(block => block.type === "table");
    if (!table || table.type !== "table") throw new Error("Expected table after rich paste");
    const cell = table.children[0]?.children[0];
    const firstParagraph = cell?.children[0];
    const secondParagraph = cell?.children[1];
    if (!firstParagraph || firstParagraph.type !== "paragraph" || !secondParagraph || secondParagraph.type !== "paragraph") {
      throw new Error("Expected two paragraphs in cell after rich paste");
    }
    expect(cell?.children.map(paragraph => getPlainText(paragraph))).toEqual(["Bold", "italic"]);
    expect(firstParagraph.children.some(run => run.text === "Bold" && run.marks.some(mark => mark.type === "bold"))).toBe(true);
    expect(secondParagraph.children.some(run => run.text === "italic" && run.marks.some(mark => mark.type === "italic"))).toBe(true);
    expect(onDocumentChange).toHaveBeenCalled();
    expect(onStatus).toHaveBeenLastCalledWith("Conteúdo formatado colado na célula com sanitização.");
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

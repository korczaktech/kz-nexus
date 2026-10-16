// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDocument,
  layoutDocument,
  type NexusDocument,
} from "../../../packages/engine/src/index";
import { CanvasDocumentRenderer } from "./CanvasDocumentRenderer";

function makeCanvasContext(textCalls: string[]): CanvasRenderingContext2D {
  const methods: Record<string, unknown> = {
    measureText: (text: string) => ({ width: text.length * 6 }),
    fillText: (text: string) => { textCalls.push(String(text)); },
    setTransform: () => undefined,
    clearRect: () => undefined,
    fillRect: () => undefined,
    strokeRect: () => undefined,
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    stroke: () => undefined,
    fill: () => undefined,
    closePath: () => undefined,
    rect: () => undefined,
    ellipse: () => undefined,
    clip: () => undefined,
    save: () => undefined,
    restore: () => undefined,
    translate: () => undefined,
    setLineDash: () => undefined,
    drawImage: () => undefined,
  };
  return new Proxy(methods as unknown as CanvasRenderingContext2D, {
    get(target, property) {
      if (property in target) return target[property as keyof CanvasRenderingContext2D];
      return () => undefined;
    },
    set(target, property, value) {
      (target as unknown as Record<PropertyKey, unknown>)[property] = value;
      return true;
    },
  });
}

function makeRenderFixture(): NexusDocument {
  const document = createDocument({ title: "Canvas renderer regression" });
  const original = document.content[0];
  if (!original || original.type !== "paragraph") throw new Error("Expected initial paragraph");
  original.children[0]!.text = "Shape body";
  original.editorObject = {
    kind: "shape",
    shape: "rectangle",
    label: "Shape label",
    fill: "#fef3c7",
    stroke: "#d97706",
    width: 160,
    height: 60,
  };
  document.content.push({
    type: "paragraph",
    id: "renderer-body",
    children: [{ type: "text", id: "renderer-body-run", text: "Body text", marks: [{ type: "bold" }] }],
  });
  document.content.push({
    type: "table",
    id: "renderer-table",
    children: [{
      type: "tableRow",
      id: "renderer-row",
      children: [{
        type: "tableCell",
        id: "renderer-cell",
        children: [{
          type: "paragraph",
          id: "renderer-cell-paragraph",
          children: [{ type: "text", id: "renderer-cell-run", text: "Table cell text", marks: [] }],
        }],
      }],
    }],
  });
  document.content.push({
    type: "image",
    id: "renderer-image",
    resourceId: "renderer-image-resource",
    alt: "Image alternative text",
    width: 24,
    height: 24,
  });
  document.content.push({
    type: "thematicBreak",
    id: "renderer-page-break",
    kind: "pageBreak",
  });
  document.resources.push({
    id: "renderer-image-resource",
    kind: "image",
    mimeType: "image/png",
    data: "iVBORw0KGgo=",
    byteLength: 8,
    name: "fixture.png",
  });
  return document;
}

describe("CanvasDocumentRenderer visual regression contract", () => {
  let host: HTMLDivElement | undefined;
  let root: ReturnType<typeof createRoot> | undefined;
  let contextSpy: { mockRestore: () => void } | undefined;

  afterEach(async () => {
    if (root) await act(async () => { root?.unmount(); });
    contextSpy?.mockRestore();
    host?.remove();
    host = undefined;
    root = undefined;
    contextSpy = undefined;
  });

  it("draws text, table cells, semantic objects, header, footer, and page numbers", async () => {
    const document = makeRenderFixture();
    const layout = layoutDocument(document);
    const textCalls: string[] = [];
    const context = makeCanvasContext(textCalls);
    contextSpy = vi.spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(() => context);

    host = window.document.createElement("div");
    window.document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(createElement(CanvasDocumentRenderer, {
        document,
        layout,
        headerText: "Document header",
        footerText: "Document footer",
        footerAlign: "right",
        showPageNumbers: true,
      }));
    });

    expect(host.querySelector('[data-renderer="canvas-2d"]')).not.toBeNull();
    expect(textCalls).toContain("Shape label");
    expect(textCalls).toContain("Body text");
    expect(textCalls).toContain("Table cell text");
    expect(textCalls).toContain("Image alternative text");
    expect(layout.pageCount).toBeGreaterThan(1);
    expect(textCalls).toContain("Document header");
    expect(textCalls).toContain("Document footer");
    expect(textCalls.some(value => value.startsWith("Página 1 de "))).toBe(true);
    expect(host.querySelectorAll("canvas.kortex-canvas-page").length).toBe(layout.pageCount);
  });
});

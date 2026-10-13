import { PreviewController } from "./services/controller";
import { renderDocument } from "./editor/render";
import { readDomSelection, writeDomSelection } from "./editor/dom-selection";
import { attachInput } from "./editor/input";
import { Inspector } from "./inspector/inspector";
import { Diagnostics } from "./diagnostics/diagnostics";
import { fileToBase64, readFileAsText, downloadText } from "./services/files";
import type { Alignment, NexusDocument } from "@korczak/nexus-engine";

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<Record<string, string>> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) if (v !== undefined) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

export function mount(rootEl: HTMLElement): PreviewController {
  const controller = new PreviewController();
  void readFileAsText;
  void downloadText;

  // ── layout ──
  const brand = h("div", { class: "brand" }, h("span", { class: "mark", "aria-hidden": "true" }, "N"), h("div", {}, h("strong", {}, "Korczak Nexus Engine"), h("span", { class: "sub" }, "Preview do motor · formato .nsx")));
  const fileLabel = h("span", { class: "file", "data-testid": "file-name" });
  const header = h("header", { class: "top" }, brand, fileLabel);

  const toolbar = h("div", { class: "toolbar", role: "toolbar", "aria-label": "Formatação" });
  const editorHost = h("div", { class: "editor-scroll" });
  const surface = h("div", { class: "surface", contenteditable: "true", spellcheck: "false", role: "textbox", "aria-multiline": "true", "aria-label": "Documento", "data-testid": "editor", tabindex: "0" });
  editorHost.append(surface);
  const sideTabs = h("div", { class: "side-tabs", role: "tablist" });
  const inspectorHost = h("section", { class: "panel", "data-panel": "inspector", "aria-label": "Inspetor" });
  const diagHost = h("section", { class: "panel", "data-panel": "diagnostics", "aria-label": "Diagnóstico", hidden: "" });
  const side = h("aside", { class: "side" }, sideTabs, inspectorHost, diagHost);
  const status = h("footer", { class: "status", "data-testid": "status" });
  rootEl.replaceChildren(header, toolbar, h("main", { class: "workspace" }, editorHost, side), status);

  const inspector = new Inspector(inspectorHost, controller);
  const diagnostics = new Diagnostics(diagHost, controller);

  let sidePanel: "inspector" | "diagnostics" = "inspector";
  const setPanel = (p: "inspector" | "diagnostics"): void => {
    sidePanel = p;
    inspectorHost.hidden = p !== "inspector";
    diagHost.hidden = p !== "diagnostics";
    for (const b of Array.from(sideTabs.children)) b.setAttribute("aria-selected", String(b.getAttribute("data-panel-tab") === p));
    refresh(true);
  };
  for (const [id, label] of [["inspector", "Inspetor"], ["diagnostics", "Diagnóstico"]] as const) {
    const b = h("button", { type: "button", role: "tab", "data-panel-tab": id }, label);
    b.addEventListener("click", () => setPanel(id));
    sideTabs.append(b);
  }

  // ── toolbar ──
  const buttons = new Map<string, HTMLButtonElement>();
  const group = (): HTMLElement => h("div", { class: "group" });
  const addButton = (g: HTMLElement, id: string, label: string, title: string, onClick: () => void): void => {
    const b = h("button", { type: "button", title, "aria-label": title, "data-cmd": id }, label);
    b.addEventListener("mousedown", (e) => e.preventDefault()); // keep the editor selection
    b.addEventListener("click", () => { onClick(); });
    buttons.set(id, b);
    g.append(b);
  };
  const fileInputImage = h("input", { type: "file", accept: "image/png,image/jpeg,image/gif,image/webp", hidden: "", "data-testid": "image-input" });

  const gHistory = group();
  addButton(gHistory, "undo", "↶", "Desfazer", () => controller.undo());
  addButton(gHistory, "redo", "↷", "Refazer", () => controller.redo());
  const gMarks = group();
  addButton(gMarks, "bold", "B", "Negrito", () => controller.toggleMark({ type: "bold" }));
  addButton(gMarks, "italic", "I", "Itálico", () => controller.toggleMark({ type: "italic" }));
  addButton(gMarks, "underline", "U", "Sublinhado", () => controller.toggleMark({ type: "underline" }));
  addButton(gMarks, "strike", "S", "Tachado", () => controller.toggleMark({ type: "strike" }));

  const colorInput = h("input", { type: "color", value: "#c0392b", title: "Cor do texto", "aria-label": "Cor do texto", "data-cmd": "color" });
  colorInput.addEventListener("change", () => controller.setMark({ type: "color", value: colorInput.value }));
  const highlightInput = h("input", { type: "color", value: "#fff3a3", title: "Cor de destaque", "aria-label": "Cor de destaque", "data-cmd": "highlight" });
  highlightInput.addEventListener("change", () => controller.setMark({ type: "highlight", value: highlightInput.value }));
  const sizeSelect = h("select", { title: "Tamanho da fonte", "aria-label": "Tamanho da fonte", "data-cmd": "fontSize" }, h("option", { value: "" }, "Tamanho"));
  for (const s of [9, 10, 11, 12, 14, 18, 24, 36]) sizeSelect.append(h("option", { value: String(s) }, `${s} pt`));
  sizeSelect.addEventListener("change", () => {
    if (sizeSelect.value) controller.setMark({ type: "fontSize", value: Number(sizeSelect.value) });
    sizeSelect.value = "";
  });
  const fontFamilySelect = h("select", { title: "Família da fonte", "aria-label": "Família da fonte", "data-cmd": "fontFamily" }, h("option", { value: "" }, "Fonte"));
  for (const family of ["Arial", "Calibri", "Georgia", "Times New Roman", "Verdana", "Courier New", "Inter", "Garamond"]) fontFamilySelect.append(h("option", { value: family }, family));
  fontFamilySelect.addEventListener("change", () => {
    if (fontFamilySelect.value) controller.setMark({ type: "fontFamily", value: fontFamilySelect.value });
    fontFamilySelect.value = "";
  });
  const gColor = group();
  gColor.append(colorInput, highlightInput, sizeSelect, fontFamilySelect);

  const gAlign = group();
  for (const [id, label, title] of [["start", "⟸", "Alinhar à esquerda"], ["center", "≡", "Centralizar"], ["end", "⟹", "Alinhar à direita"], ["justify", "☰", "Justificar"]] as const) {
    addButton(gAlign, `align-${id}`, label, title, () => controller.setAlignment(id as Alignment));
  }
  const blockSelect = h("select", { title: "Tipo de bloco", "aria-label": "Tipo de bloco", "data-cmd": "blockType" },
    h("option", { value: "paragraph" }, "Parágrafo"), h("option", { value: "1" }, "Título 1"), h("option", { value: "2" }, "Título 2"), h("option", { value: "3" }, "Título 3"), h("option", { value: "4" }, "Título 4"), h("option", { value: "5" }, "Título 5"), h("option", { value: "6" }, "Título 6"));
  blockSelect.addEventListener("change", () => {
    const v = blockSelect.value;
    controller.setBlockType(v === "paragraph" ? "paragraph" : (Number(v) as 1 | 2 | 3 | 4 | 5 | 6));
  });
  const gBlock = group();
  gBlock.append(blockSelect);
  addButton(gBlock, "ul", "• Lista", "Lista com marcadores", () => controller.insertListBlock(false));
  addButton(gBlock, "ol", "1. Lista", "Lista numerada", () => controller.insertListBlock(true));
  addButton(gBlock, "quote", "❝", "Citação", () => controller.insertQuote());
  addButton(gBlock, "hr", "―", "Separador", () => controller.insertRule());

  const gTable = group();
  addButton(gTable, "table", "Tabela 3×3", "Inserir tabela 3×3", () => controller.insertTableBlock(3, 3));
  addButton(gTable, "row-add", "+ Linha", "Adicionar linha", () => controller.tableAction("addRow"));
  addButton(gTable, "row-del", "− Linha", "Remover linha", () => controller.tableAction("removeRow"));
  addButton(gTable, "col-add", "+ Coluna", "Adicionar coluna", () => controller.tableAction("addColumn"));
  addButton(gTable, "col-del", "− Coluna", "Remover coluna", () => controller.tableAction("removeColumn"));

  const gMisc = group();
  addButton(gMisc, "image", "Imagem…", "Inserir imagem", () => fileInputImage.click());
  addButton(gMisc, "orientation", "Orientação", "Alternar orientação da página", () => controller.togglePageOrientation());
  fileInputImage.addEventListener("change", async () => {
    const file = fileInputImage.files?.[0];
    fileInputImage.value = "";
    if (!file) return;
    try {
      controller.insertImageFile({ name: file.name, mimeType: file.type, base64: await fileToBase64(file) });
    } catch (error) {
      controller.notify("error", `Não foi possível ler a imagem "${file.name}".`, String(error));
    }
  });
  toolbar.append(gHistory, gMarks, gColor, gAlign, gBlock, gTable, gMisc, fileInputImage);

  // ── rendering loop ──
  let lastDoc: NexusDocument | undefined;
  let suppress = false;
  const refresh = (force = false): void => {
    const doc = controller.document;
    if (force || doc !== lastDoc) {
      suppress = true;
      renderDocument(doc, surface);
      if (document.activeElement === surface || surface.contains(document.activeElement)) writeDomSelection(surface, controller.selection);
      suppress = false;
      lastDoc = doc;
    } else if (document.activeElement === surface) {
      const dom = readDomSelection(surface);
      const sel = controller.selection;
      const differs = !dom || !sel || dom.anchor.blockId !== sel.anchor.blockId || dom.anchor.offset !== sel.anchor.offset || dom.focus.blockId !== sel.focus.blockId || dom.focus.offset !== sel.focus.offset;
      if (differs && sel) writeDomSelection(surface, sel);
    }
    // toolbar state
    buttons.get("undo")!.disabled = !controller.canUndo;
    buttons.get("redo")!.disabled = !controller.canRedo;
    for (const [id, type] of [["bold", "bold"], ["italic", "italic"], ["underline", "underline"], ["strike", "strike"]] as const) {
      buttons.get(id)!.setAttribute("aria-pressed", String(controller.isMarkActive(type)));
    }
    const inTable = controller.tableContext() !== undefined;
    for (const id of ["row-add", "row-del", "col-add", "col-del"]) buttons.get(id)!.disabled = !inTable;
    const bt = controller.currentBlockType();
    blockSelect.value = /^h[1-6]$/.test(bt) ? bt.slice(1) : "paragraph";
    fileLabel.textContent = `${controller.fileName}${controller.dirty ? " •" : ""}`;
    fileLabel.setAttribute("data-dirty", String(controller.dirty));
    const sel = controller.selection;
    const m = controller.metrics;
    status.textContent = `${m.blockCount} blocos · ${m.nodeCount} nós · ${sel ? `cursor ${sel.focus.offset}` : "sem cursor"} · ${m.lastActionLabel} ${m.lastActionMs.toFixed(1)} ms`;
    if (sidePanel === "inspector") inspector.render();
    else diagnostics.render();
  };
  void suppress;

  controller.subscribe(() => refresh());
  attachInput(surface, controller);
  setPanel("inspector");
  refresh(true);
  surface.focus();
  writeDomSelection(surface, controller.selection);
  return controller;
}

declare global {
  interface Window {
    __nexusPreview?: PreviewController;
  }
}

const root = document.getElementById("app");
if (root) window.__nexusPreview = mount(root);

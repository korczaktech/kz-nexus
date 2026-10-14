import {
  createDocument,
  createEditor,
  createIdGenerator,
  readNsx,
  systemClock,
  writeNsx,
  toggleMark,
  applyMark,
  removeMark,
  setMetadata,
  replaceRange,
  getPlainText,
  isValidLink,
  isValidColor,
  exportHtml,
  renderTextRunsHtml,
  type Selection,
  type Block,
  type Mark,
  type MarkType,
  type NexusDocument,
  type TextRun,
  type ResourceRef,
} from "../../../packages/engine/src/index";

const nextId = createIdGenerator("nexus");
function marksFor(element: Element, inherited: Mark[]): Mark[] {
  const marks = [...inherited];
  const tag = element.tagName.toLowerCase();
  const add = (mark: Mark) => { if (!marks.some(item => item.type === mark.type)) marks.push(mark); };
  if (tag === "b" || tag === "strong") add({ type: "bold" });
  if (tag === "i" || tag === "em") add({ type: "italic" });
  if (tag === "u") add({ type: "underline" });
  if (tag === "s" || tag === "strike" || tag === "del") add({ type: "strike" });
  if (tag === "sup") add({ type: "superscript" });
  if (tag === "sub") add({ type: "subscript" });
  if (tag === "a") { const href = element.getAttribute("href") ?? ""; if (isValidLink(href)) add({ type: "link", value: href }); }
  const comment = tag === "span" ? element.getAttribute("data-kz-comment") : null;
  if (comment && comment.trim().length <= 2000) add({ type: "comment", value: comment });
  const style = (element as HTMLElement).style;
  if (style.color) add({ type: "color", value: style.color });
  if (style.backgroundColor && !comment) add({ type: "highlight", value: style.backgroundColor });
  if (style.fontSize) {
    const size = Number.parseFloat(style.fontSize);
    if (Number.isFinite(size) && size > 0 && size <= 200) add({ type: "fontSize", value: size });
  }
  if (style.fontFamily) add({ type: "fontFamily", value: style.fontFamily.replace(/["']/g, "") });
  return marks;
}

function inlineRuns(node: Node, marks: Mark[] = []): TextRun[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    return text ? [{ type: "text", id: nextId(), text, marks: [...marks] }] : [];
  }
  if (!(node instanceof Element)) return [];
  if (node.tagName.toLowerCase() === "br") {
    return [{ type: "text", id: nextId(), text: "\n", marks: [...marks] }];
  }
  return Array.from(node.childNodes).flatMap(child => inlineRuns(child, marksFor(node, marks)));
}

function indentInPoints(node: Element): number | undefined {
  const value = (node as HTMLElement).style.marginLeft;
  if (!value) return undefined;
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const unit = value.trim().match(/[a-z%]+$/i)?.[0]?.toLowerCase() ?? "px";
  const points = unit === "pt" ? amount : unit === "in" ? amount * 72 : unit === "cm" ? amount * 28.3464567 : unit === "mm" ? amount * 2.83464567 : amount * 0.75;
  return Math.min(720, Math.max(0, points));
}

function makeParagraph(node: Element, type: "paragraph" | "heading" = "paragraph"): Extract<Block, { type: "paragraph" }> | Extract<Block, { type: "heading" }> {
  const children = inlineRuns(node);
  const runs = children.length ? children : [{ type: "text" as const, id: nextId(), text: "", marks: [] }];
  const align = (node as HTMLElement).style.textAlign;
  const indent = indentInPoints(node);
  const alignment = align && ["left", "start", "center", "right", "end", "justify"].includes(align)
    ? { align: align === "left" ? "start" as const : align === "right" ? "end" as const : align as "start" | "end" | "center" | "justify" }
    : {};
  const indentation = indent !== undefined ? { indent } : {};
  if (type === "heading") {
    const level = Math.min(6, Math.max(1, Number(node.tagName.slice(1)) || 1)) as 1 | 2 | 3 | 4 | 5 | 6;
    return { type: "heading", id: nextId(), level, ...alignment, ...indentation, children: runs };
  }
  return { type: "paragraph", id: nextId(), ...alignment, ...indentation, children: runs };
}

function listBlock(element: Element): Extract<Block, { type: "bulletList" | "orderedList" }> {
  const ordered = element.tagName.toLowerCase() === "ol";
  const children = Array.from(element.children).filter(item => item.tagName.toLowerCase() === "li").map(item => ({
    type: "listItem" as const,
    id: nextId(),
    children: [makeParagraph(item) as Extract<Block, { type: "paragraph" }>],
  }));
  return ordered
    ? { type: "orderedList", id: nextId(), start: Math.max(1, Number(element.getAttribute("start")) || 1), children }
    : { type: "bulletList", id: nextId(), children };
}

function tableBlock(element: Element): Extract<Block, { type: "table" }> {
  const rows = Array.from(element.querySelectorAll("tr")).map(row => ({
    type: "tableRow" as const,
    id: nextId(),
    children: Array.from(row.children).filter(cell => ["td", "th"].includes(cell.tagName.toLowerCase())).map(cell => {
      const nested = Array.from(cell.children).filter(child => /^(P|H[1-6])$/.test(child.tagName)).map(child => {
        const paragraph = makeParagraph(child);
        return paragraph.type === "heading" ? { type: "paragraph" as const, id: paragraph.id, align: paragraph.align, children: paragraph.children } : paragraph;
      });
      return { type: "tableCell" as const, id: nextId(), children: nested.length ? nested : [makeParagraph(cell) as Extract<Block, { type: "paragraph" }>] };
    }),
  })).filter(row => row.children.length > 0);
  return { type: "table", id: nextId(), children: rows };
}

function sanitizeImportedHtml(parsed: Document): void {
  parsed.querySelectorAll("script,style,iframe,object,embed,form,input,button,textarea,select,option,link,meta,base,svg,math,template").forEach(node => node.remove());
  const allowedStyles = new Set(["color", "background-color", "font-size", "font-family", "text-align", "margin-left", "width", "height"]);
  parsed.body.querySelectorAll("*").forEach(element => {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on") || name === "srcdoc" || name === "formaction" || name === "xmlns") {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (name === "href") {
        if (element.tagName.toLowerCase() !== "a" || !isValidLink(attribute.value)) element.removeAttribute(attribute.name);
        continue;
      }
      if (name === "src") {
        const value = attribute.value;
        if (element.tagName.toLowerCase() !== "img" || !/^data:image\/(?:png|jpeg|gif|webp|svg\+xml);base64,[a-z0-9+/=]+$/i.test(value)) element.removeAttribute(attribute.name);
        continue;
      }
      if (name === "style") {
        const style = (element as HTMLElement).style;
        for (const property of Array.from(style)) {
          const value = style.getPropertyValue(property).trim();
          const valid = allowedStyles.has(property) && (
            (property === "color" || property === "background-color") ? isValidColor(value) :
            property === "font-size" ? /^(?:\d+(?:\.\d+)?)(?:px|pt|em|rem|%)$/i.test(value) && Number.parseFloat(value) > 0 && Number.parseFloat(value) <= 200 :
            property === "font-family" ? /^[\w\s,'"()-]{1,120}$/.test(value) :
            property === "text-align" ? /^(?:left|right|center|justify|start|end)$/i.test(value) :
            /^(?:\d+(?:\.\d+)?)(?:px|pt|mm|cm|in|%)$/i.test(value)
          );
          if (!valid) style.removeProperty(property);
        }
        if (!style.length) element.removeAttribute("style");
        continue;
      }
      if (name === "width" || name === "height") {
        if (!/^\d{1,4}$/.test(attribute.value) || Number(attribute.value) < 1 || Number(attribute.value) > 4096) element.removeAttribute(attribute.name);
        continue;
      }
      if (name === "data-kz-comment") { if (element.tagName.toLowerCase() !== "span" || !attribute.value.trim() || attribute.value.length > 2000) element.removeAttribute(attribute.name); continue; }
      if (["alt", "title", "start", "colspan", "rowspan"].includes(name)) continue;
      element.removeAttribute(attribute.name);
    }
  });
}

function blocksFromHtml(html: string, resources: ResourceRef[] = []): Block[] {
  const parsed = new DOMParser().parseFromString(html || "<p></p>", "text/html");
  sanitizeImportedHtml(parsed);
  const blocks: Block[] = [];
  const visit = (element: Element) => {
    const tag = element.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) blocks.push(makeParagraph(element, "heading"));
    else if (tag === "p" || tag === "div" || tag === "pre") {
      const directChildren = Array.from(element.children);
      const standaloneImage = directChildren.length === 1 && directChildren[0].tagName.toLowerCase() === "img" && !(element.textContent || "").trim();
      if (standaloneImage) {
        visit(directChildren[0]);
      } else if (tag === "div" && element.querySelector(":scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > ul, :scope > ol, :scope > table, :scope > img")) {
        Array.from(element.children).forEach(visit);
      } else blocks.push(makeParagraph(element));
    } else if (tag === "blockquote") {
      const children = Array.from(element.children).filter(child => ["p", "div"].includes(child.tagName.toLowerCase())).map(child => makeParagraph(child) as Extract<Block, { type: "paragraph" }>);
      blocks.push({ type: "blockquote", id: nextId(), children: children.length ? children : [{ ...makeParagraph(element), type: "paragraph" }] });
    } else if (tag === "ul" || tag === "ol") blocks.push(listBlock(element));
    else if (tag === "table") blocks.push(tableBlock(element));
    else if (tag === "hr") blocks.push({ type: "thematicBreak", id: nextId() });
    else if (tag === "img") {
      const alt = element.getAttribute("alt") || "Imagem";
      const src = element.getAttribute("src") || "";
      const match = /^data:(image\/(?:png|jpeg|gif|webp|svg\+xml));base64,([a-z0-9+/=]+)$/i.exec(src);
      if (match) {
        const mimeType = match[1].toLowerCase();
        const data = match[2];
        const resourceId = nextId();
        resources.push({ id: resourceId, kind: "image", mimeType, data, byteLength: Math.floor(data.replace(/=+$/, "").length * 3 / 4), name: alt });
        const width = Number((element as HTMLImageElement).getAttribute("width")) || undefined;
        const height = Number((element as HTMLImageElement).getAttribute("height")) || undefined;
        blocks.push({ type: "image", id: nextId(), resourceId, alt, width, height });
      } else {
        blocks.push({ type: "paragraph", id: nextId(), children: [{ type: "text", id: nextId(), text: "[" + alt + "]", marks: [] }] });
      }
    } else if (element.textContent?.trim()) blocks.push(makeParagraph(element));
  };
  Array.from(parsed.body.children).forEach(visit);
  if (!blocks.length) blocks.push({ type: "paragraph", id: nextId(), children: [{ type: "text", id: nextId(), text: "", marks: [] }] });
  return blocks;
}

export function nexusDocumentFromHtml(html: string, title = "Documento"): NexusDocument {
  const base = createDocument({ title }, nextId, systemClock);
  const resources: ResourceRef[] = [];
  const content = blocksFromHtml(html, resources);
  return { ...base, content, resources };
}

export function htmlFromNexusDocument(document: NexusDocument): string {
  return exportHtml(document);
}

type LogicalTextBlock = Extract<Block, { type: "paragraph" | "heading" }>;

function logicalTextBlocks(blocks: Block[]): LogicalTextBlock[] {
  const result: LogicalTextBlock[] = [];
  const visit = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "paragraph" || node.type === "heading") {
      result.push(node as LogicalTextBlock);
      return;
    }
    if (node.type === "blockquote") node.children.forEach(visit);
    else if (node.type === "bulletList" || node.type === "orderedList") {
      node.children.forEach((item: any) => item.children.forEach(visit));
    } else if (node.type === "table") {
      node.children.forEach((row: any) => row.children.forEach((cell: any) => cell.children.forEach(visit)));
    }
  };
  blocks.forEach(visit);
  return result;
}

function domTextBlocks(root: HTMLElement): HTMLElement[] {
  const selector = "p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote";
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(element => {
    const tag = element.tagName.toLowerCase();
    if (!["li", "td", "th", "blockquote"].includes(tag)) return true;
    return !Array.from(element.children).some(child => /^(P|H[1-6])$/.test(child.tagName));
  });
}

function pointOffset(block: HTMLElement, node: Node, offset: number): number | null {
  if (!block.contains(node) && block !== node) return null;
  try {
    const range = block.ownerDocument.createRange();
    range.selectNodeContents(block);
    range.setEnd(node, offset);
    return range.toString().length;
  } catch {
    return null;
  }
}

function logicalTextLength(block: LogicalTextBlock): number {
  return block.children.reduce((length, run) => length + run.text.length, 0);
}

export interface EngineDomContext {
  block: LogicalTextBlock;
  blockIndex: number;
  endBlockIndex: number;
  endBlockId: string;
  endTopLevelBlock: Block;
  endTopLevelIndex: number;
  startOffset: number;
  endOffset: number;
  anchorBlockId: string;
  anchorOffset: number;
  focusBlockId: string;
  focusOffset: number;
  topLevelBlock: Block;
  topLevelIndex: number;
  list?: Extract<Block, { type: "bulletList" | "orderedList" }>;
  listItemId?: string;
  table?: Extract<Block, { type: "table" }>;
  rowId?: string;
  cellId?: string;
  columnIndex?: number;
}

/** Maps the browser selection to stable model IDs before a command is dispatched. */
function containsLogicalBlock(block: Block, targetId: string): boolean {
  if (block.id === targetId) return true;
  if (block.type === "blockquote") return block.children.some(child => child.id === targetId);
  if (block.type === "bulletList" || block.type === "orderedList") return block.children.some(item => item.children.some(child => containsLogicalBlock(child as Block, targetId)));
  if (block.type === "table") return block.children.some(row => row.children.some(cell => cell.children.some(child => child.id === targetId)));
  return false;
}

export function getEngineDomContext(
  engine: ReturnType<typeof createEditor>,
  root: HTMLElement,
): EngineDomContext | null {
  const selection = root.ownerDocument.defaultView?.getSelection();
  if (!selection?.rangeCount || !selection.anchorNode || !selection.focusNode) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const domBlocks = domTextBlocks(root);
  const modelBlocks = logicalTextBlocks(engine.getDocument().content);
  if (!domBlocks.length || domBlocks.length !== modelBlocks.length) return null;
  const startElement = (range.startContainer instanceof HTMLElement ? range.startContainer : range.startContainer.parentElement)
    ?.closest<HTMLElement>("p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote");
  const endElement = (range.endContainer instanceof HTMLElement ? range.endContainer : range.endContainer.parentElement)
    ?.closest<HTMLElement>("p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote");
  const startIndex = startElement ? domBlocks.indexOf(startElement) : -1;
  const endIndex = endElement ? domBlocks.indexOf(endElement) : -1;
  if (startIndex < 0 || endIndex < 0 || startIndex > endIndex) return null;
  const startOffset = pointOffset(domBlocks[startIndex], range.startContainer, range.startOffset);
  const endOffset = pointOffset(domBlocks[endIndex], range.endContainer, range.endOffset);
  if (startOffset === null || endOffset === null) return null;
  const anchorElement = (selection.anchorNode instanceof HTMLElement ? selection.anchorNode : selection.anchorNode.parentElement)?.closest<HTMLElement>("p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote");
  const focusElement = (selection.focusNode instanceof HTMLElement ? selection.focusNode : selection.focusNode.parentElement)?.closest<HTMLElement>("p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote");
  const anchorIndex = anchorElement ? domBlocks.indexOf(anchorElement) : -1;
  const focusIndex = focusElement ? domBlocks.indexOf(focusElement) : -1;
  const anchorOffset = anchorIndex >= 0 ? pointOffset(domBlocks[anchorIndex], selection.anchorNode, selection.anchorOffset) : null;
  const focusOffset = focusIndex >= 0 ? pointOffset(domBlocks[focusIndex], selection.focusNode, selection.focusOffset) : null;
  if (anchorIndex < 0 || focusIndex < 0 || anchorOffset === null || focusOffset === null) return null;
  const selected = modelBlocks[startIndex];
  let topLevelBlock: Block | undefined;
  let topLevelIndex = -1;
  let list: EngineDomContext["list"];
  let listItemId: string | undefined;
  let table: EngineDomContext["table"];
  let rowId: string | undefined;
  let cellId: string | undefined;
  let columnIndex: number | undefined;
  const visit = (block: Block, topIndex: number, listOwner?: EngineDomContext["list"], itemId?: string, tableOwner?: EngineDomContext["table"], row?: string, cell?: string, column?: number): boolean => {
    if ((block.type === "paragraph" || block.type === "heading") && block.id === selected.id) {
      topLevelBlock = engine.getDocument().content[topIndex];
      topLevelIndex = topIndex;
      list = listOwner;
      listItemId = itemId;
      table = tableOwner;
      rowId = row;
      cellId = cell;
      columnIndex = column;
      return true;
    }
    if (block.type === "blockquote") return block.children.some(child => visit(child, topIndex, listOwner, itemId, tableOwner, row, cell, column));
    if (block.type === "bulletList" || block.type === "orderedList") return block.children.some(item => item.children.some(child => visit(child as Block, topIndex, block, item.id, tableOwner, row, cell, column)));
    if (block.type === "table") return block.children.some((tableRow, rowIndex) => tableRow.children.some((tableCell, cellIndex) => tableCell.children.some(child => visit(child, topIndex, listOwner, itemId, block, tableRow.id, tableCell.id, cellIndex))));
    return false;
  };
  engine.getDocument().content.some((block, index) => visit(block, index));
  if (!topLevelBlock) return null;
  const endSelected = modelBlocks[endIndex];
  const endTopLevelIndex = engine.getDocument().content.findIndex(block => containsLogicalBlock(block, endSelected.id));
  const endTopLevelBlock = endTopLevelIndex >= 0 ? engine.getDocument().content[endTopLevelIndex] : undefined;
  if (!endTopLevelBlock) return null;
  return { block: selected, blockIndex: startIndex, endBlockIndex: endIndex, endBlockId: endSelected.id, endTopLevelBlock, endTopLevelIndex, startOffset, endOffset, anchorBlockId: modelBlocks[anchorIndex].id, anchorOffset, focusBlockId: modelBlocks[focusIndex].id, focusOffset, topLevelBlock, topLevelIndex, list, listItemId, table, rowId, cellId, columnIndex };
}

/** Re-renders the canonical model through the adapter, not through browser editing commands. */
export function renderEngineIntoDom(engine: ReturnType<typeof createEditor>, root: HTMLElement): void {
  root.innerHTML = htmlFromNexusDocument(engine.getDocument());
}

/** Executes a formatting mark through the engine, then projects only affected text runs back into the DOM. */
export function toggleEngineMarkForDomSelection(
  engine: ReturnType<typeof createEditor>,
  root: HTMLElement,
  mark: Mark,
  toggle = true,
): { ok: boolean; message?: string } {
  return updateEngineMarksForDomSelection(engine, root, [mark], toggle);
}

export function applyEngineMarksForDomSelection(
  engine: ReturnType<typeof createEditor>,
  root: HTMLElement,
  marks: Mark[],
): { ok: boolean; message?: string } {
  return updateEngineMarksForDomSelection(engine, root, marks, false);
}

function updateEngineMarksForDomSelection(
  engine: ReturnType<typeof createEditor>,
  root: HTMLElement,
  marks: Mark[],
  toggle: boolean,
): { ok: boolean; message?: string } {
  const selection = root.ownerDocument.defaultView?.getSelection();
  if (!selection || selection.isCollapsed || !selection.anchorNode || !selection.focusNode) {
    return { ok: false, message: "Selecione o texto que deseja formatar." };
  }
  const range = selection.rangeCount ? selection.getRangeAt(0) : null;
  if (!range || !root.contains(range.startContainer) || !root.contains(range.endContainer)) {
    return { ok: false, message: "A seleção precisa estar dentro do documento." };
  }

  const domBlocks = domTextBlocks(root);
  const modelBlocks = logicalTextBlocks(engine.getDocument().content);
  if (!domBlocks.length || domBlocks.length !== modelBlocks.length) {
    return { ok: false, message: "Não foi possível mapear a seleção para o modelo do motor." };
  }
  const startElement = (range.startContainer instanceof HTMLElement
    ? range.startContainer
    : range.startContainer.parentElement)?.closest<HTMLElement>("p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote");
  const endElement = (range.endContainer instanceof HTMLElement
    ? range.endContainer
    : range.endContainer.parentElement)?.closest<HTMLElement>("p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote");
  const startIndex = startElement ? domBlocks.indexOf(startElement) : -1;
  const endIndex = endElement ? domBlocks.indexOf(endElement) : -1;
  if (startIndex < 0 || endIndex < 0 || startIndex > endIndex) {
    return { ok: false, message: "Não foi possível identificar os parágrafos selecionados." };
  }
  const startOffset = pointOffset(domBlocks[startIndex], range.startContainer, range.startOffset);
  const endOffset = pointOffset(domBlocks[endIndex], range.endContainer, range.endOffset);
  if (startOffset === null || endOffset === null) {
    return { ok: false, message: "Não foi possível calcular os limites da seleção." };
  }

  const anchorElement = (selection.anchorNode instanceof HTMLElement ? selection.anchorNode : selection.anchorNode.parentElement)?.closest<HTMLElement>("p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote");
  const focusElement = (selection.focusNode instanceof HTMLElement ? selection.focusNode : selection.focusNode.parentElement)?.closest<HTMLElement>("p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote");
  const anchorIndex = anchorElement ? domBlocks.indexOf(anchorElement) : -1;
  const focusIndex = focusElement ? domBlocks.indexOf(focusElement) : -1;
  const anchorOffset = anchorIndex >= 0 ? pointOffset(domBlocks[anchorIndex], selection.anchorNode!, selection.anchorOffset) : null;
  const focusOffset = focusIndex >= 0 ? pointOffset(domBlocks[focusIndex], selection.focusNode!, selection.focusOffset) : null;
  if (anchorIndex < 0 || focusIndex < 0 || anchorOffset === null || focusOffset === null) return { ok: false, message: "Não foi possível mapear a direção da seleção." };
  const anchor = { blockId: modelBlocks[anchorIndex].id, offset: anchorOffset };
  const focus = { blockId: modelBlocks[focusIndex].id, offset: focusOffset };
  const setSelection = engine.setSelection({ anchor, focus });
  if (!setSelection.ok) return { ok: false, message: setSelection.error.message };

  if (!marks.length) return { ok: false, message: "Nenhuma marca foi informada." };
  const commands = modelBlocks.slice(startIndex, endIndex + 1).flatMap((block, relativeIndex) => {
    const index = startIndex + relativeIndex;
    const start = index === startIndex ? startOffset : 0;
    const end = index === endIndex ? endOffset : logicalTextLength(block);
    if (end <= start) return [];
    return marks.map(mark => toggle
      ? toggleMark({ blockId: block.id, start, end, mark })
      : applyMark({ blockId: block.id, start, end, mark }));
  });
  if (!commands.length) return { ok: false, message: "Selecione pelo menos um caractere." };

  const result = engine.exec(commands, { group: "formatting" });
  if (!result.ok) return { ok: false, message: result.error.message };

  const updatedBlocks = logicalTextBlocks(engine.getDocument().content);
  for (let index = startIndex; index <= endIndex; index++) {
    domBlocks[index].innerHTML = renderTextRunsHtml(updatedBlocks[index].children);
  }
  return { ok: true };
}

/** Restores the DOM selection from the engine's logical selection after a formatting projection. */
export function restoreEngineDomSelection(engine: ReturnType<typeof createEditor>, root: HTMLElement): void {
  const logical = engine.getSelection();
  if (!logical) return;
  const modelBlocks = logicalTextBlocks(engine.getDocument().content);
  const domBlocks = domTextBlocks(root);
  const findPoint = (block: HTMLElement, offset: number): { node: Node; offset: number } => {
    const walker = block.ownerDocument.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let remaining = Math.max(0, offset);
    let last: Node = block;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      last = node;
      const length = node.textContent?.length ?? 0;
      if (remaining <= length) return { node, offset: remaining };
      remaining -= length;
    }
    return last === block ? { node: block, offset: block.childNodes.length } : { node: last, offset: last.textContent?.length ?? 0 };
  };
  const resolve = (point: Selection["anchor"]) => {
    const index = modelBlocks.findIndex(block => block.id === point.blockId);
    if (index < 0 || !domBlocks[index]) return null;
    return findPoint(domBlocks[index], point.offset);
  };
  const anchor = resolve(logical.anchor);
  const focus = resolve(logical.focus);
  if (!anchor || !focus) return;
  const selection = root.ownerDocument.defaultView?.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  if (typeof selection.setBaseAndExtent === "function") {
    selection.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
  } else {
    const range = root.ownerDocument.createRange();
    range.setStart(anchor.node, anchor.offset);
    range.setEnd(focus.node, focus.offset);
    selection.addRange(range);
  }
}

function preserveStableBlockIds(previous: Block[], next: Block[], resourceIds: Map<string, string> = new Map()): Block[] {
  return next.map((block, index) => {
    const old = previous[index];
    if (!old || old.type !== block.type) return block;
    if (block.type === "paragraph" && old.type === "paragraph") {
      return { ...block, id: old.id, children: block.children.map((run, runIndex) => ({ ...run, id: old.children[runIndex]?.id ?? run.id })) };
    }
    if (block.type === "heading" && old.type === "heading") {
      return { ...block, id: old.id, children: block.children.map((run, runIndex) => ({ ...run, id: old.children[runIndex]?.id ?? run.id })) };
    }
    if (block.type === "blockquote" && old.type === "blockquote") {
      return { ...block, id: old.id, children: preserveStableBlockIds(old.children, block.children, resourceIds) as Extract<Block, { type: "paragraph" }>[] };
    }
    if ((block.type === "bulletList" || block.type === "orderedList") && (old.type === "bulletList" || old.type === "orderedList")) {
      return { ...block, id: old.id, children: block.children.map((item, itemIndex) => {
        const oldItem = old.children[itemIndex];
        return { ...item, id: oldItem?.id ?? item.id, children: preserveStableBlockIds(oldItem?.children as Block[] ?? [], item.children as Block[], resourceIds) as typeof item.children };
      }) } as Block;
    }
    if (block.type === "table" && old.type === "table") {
      return { ...block, id: old.id, children: block.children.map((row, rowIndex) => {
        const oldRow = old.children[rowIndex];
        return { ...row, id: oldRow?.id ?? row.id, children: row.children.map((cell, cellIndex) => {
          const oldCell = oldRow?.children[cellIndex];
          return { ...cell, id: oldCell?.id ?? cell.id, children: preserveStableBlockIds(oldCell?.children ?? [], cell.children, resourceIds) as typeof cell.children };
        }) };
      }) };
    }
    if (block.type === "thematicBreak" && old.type === "thematicBreak") return { ...block, id: old.id };
    if (block.type === "image" && old.type === "image") return { ...block, id: old.id, resourceId: resourceIds.get(block.resourceId) ?? block.resourceId };
    return block;
  });
}

function blockShape(block: Block): unknown {
  const marksShape = (runs: TextRun[]) => {
    const groups: string[] = [];
    for (const run of runs) {
      const value = JSON.stringify(run.marks);
      if (groups[groups.length - 1] !== value) groups.push(value);
    }
    return groups;
  };
  if (block.type === "paragraph") return ["paragraph", block.align ?? null, block.indent ?? null, marksShape(block.children)];
  if (block.type === "heading") return ["heading", block.level, block.align ?? null, block.indent ?? null, marksShape(block.children)];
  if (block.type === "blockquote") return ["blockquote", block.children.map(blockShape)];
  if (block.type === "bulletList" || block.type === "orderedList") return [block.type, block.type === "orderedList" ? block.start : null, block.children.map(item => item.children.map(child => blockShape(child as Block)))];
  if (block.type === "table") return ["table", block.children.map(row => row.children.map(cell => cell.children.map(blockShape)))];
  if (block.type === "thematicBreak") return ["thematicBreak"];
  return ["image", block.resourceId, block.alt];
}

function longestCommonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}
function longestCommonSuffix(a: string, b: string, prefix: number): number {
  let i = 0;
  while (i < a.length - prefix && i < b.length - prefix && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
  return i;
}


/** Removes every supported inline mark from the selected logical range via engine commands. */
export function removeEngineMarksForDomSelection(
  engine: ReturnType<typeof createEditor>,
  root: HTMLElement,
  selectedTypes?: MarkType[],
): { ok: boolean; message?: string } {
  const selection = root.ownerDocument.defaultView?.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount || !selection.anchorNode || !selection.focusNode) return { ok: false, message: "Selecione o texto que deseja limpar." };
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return { ok: false, message: "A seleção precisa estar dentro do documento." };
  const domBlocks = domTextBlocks(root);
  const modelBlocks = logicalTextBlocks(engine.getDocument().content);
  if (!domBlocks.length || domBlocks.length !== modelBlocks.length) return { ok: false, message: "Não foi possível mapear a seleção para o modelo do motor." };
  const startElement = (range.startContainer instanceof HTMLElement ? range.startContainer : range.startContainer.parentElement)?.closest<HTMLElement>("p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote");
  const endElement = (range.endContainer instanceof HTMLElement ? range.endContainer : range.endContainer.parentElement)?.closest<HTMLElement>("p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote");
  const startIndex = startElement ? domBlocks.indexOf(startElement) : -1;
  const endIndex = endElement ? domBlocks.indexOf(endElement) : -1;
  if (startIndex < 0 || endIndex < 0 || startIndex > endIndex) return { ok: false, message: "Não foi possível identificar o intervalo selecionado." };
  const startOffset = pointOffset(domBlocks[startIndex], range.startContainer, range.startOffset);
  const endOffset = pointOffset(domBlocks[endIndex], range.endContainer, range.endOffset);
  if (startOffset === null || endOffset === null) return { ok: false, message: "Não foi possível calcular os limites da seleção." };
  const anchorElement = (selection.anchorNode instanceof HTMLElement ? selection.anchorNode : selection.anchorNode.parentElement)?.closest<HTMLElement>("p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote");
  const focusElement = (selection.focusNode instanceof HTMLElement ? selection.focusNode : selection.focusNode.parentElement)?.closest<HTMLElement>("p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote");
  const anchorIndex = anchorElement ? domBlocks.indexOf(anchorElement) : -1;
  const focusIndex = focusElement ? domBlocks.indexOf(focusElement) : -1;
  const anchorOffset = anchorIndex >= 0 ? pointOffset(domBlocks[anchorIndex], selection.anchorNode!, selection.anchorOffset) : null;
  const focusOffset = focusIndex >= 0 ? pointOffset(domBlocks[focusIndex], selection.focusNode!, selection.focusOffset) : null;
  if (anchorIndex < 0 || focusIndex < 0 || anchorOffset === null || focusOffset === null) return { ok: false, message: "Não foi possível mapear a direção da seleção." };
  const selectionResult = engine.setSelection({ anchor: { blockId: modelBlocks[anchorIndex].id, offset: anchorOffset }, focus: { blockId: modelBlocks[focusIndex].id, offset: focusOffset } });
  if (!selectionResult.ok) return { ok: false, message: selectionResult.error.message };
  const types: MarkType[] = selectedTypes ?? ["bold", "italic", "underline", "strike", "superscript", "subscript", "color", "highlight", "fontSize", "fontFamily", "link"];
  const commands = modelBlocks.slice(startIndex, endIndex + 1).flatMap((block, relativeIndex) => {
    const index = startIndex + relativeIndex;
    const start = index === startIndex ? startOffset : 0;
    const end = index === endIndex ? endOffset : logicalTextLength(block);
    return end > start ? types.map(markType => removeMark({ blockId: block.id, start, end, markType })) : [];
  });
  if (!commands.length) return { ok: false, message: "Selecione pelo menos um caractere." };
  const result = engine.exec(commands, { group: "formatting" });
  if (!result.ok) return { ok: false, message: result.error.message };
  const updatedBlocks = logicalTextBlocks(engine.getDocument().content);
  for (let index = startIndex; index <= endIndex; index++) domBlocks[index].innerHTML = renderTextRunsHtml(updatedBlocks[index].children);
  return { ok: true };
}

export function removeEngineLinkForDomSelection(engine: ReturnType<typeof createEditor>, root: HTMLElement): { ok: boolean; message?: string } {
  return removeEngineMarksForDomSelection(engine, root, ["link"]);
}

export function syncNexusEngine(engine: ReturnType<typeof createEditor>, html: string, title: string): boolean {
  const parsed = nexusDocumentFromHtml(html, title);
  const previous = engine.getDocument();
  if (previous.metadata.title !== title) {
    const titleUpdate = engine.exec([setMetadata({ key: 'title', value: title })], { group: 'structural' });
    if (!titleUpdate.ok) return false;
  }
  const updatedPrevious = engine.getDocument();
  const resourceIds = new Map<string, string>();
  const resources = parsed.resources.map(resource => {
    const existing = updatedPrevious.resources.find(item => item.kind === resource.kind && item.mimeType === resource.mimeType && item.data === resource.data);
    if (!existing) return resource;
    resourceIds.set(resource.id, existing.id);
    return { ...resource, id: existing.id };
  });
  const content = preserveStableBlockIds(updatedPrevious.content, parsed.content, resourceIds);
  const next: NexusDocument = {
    ...parsed,
    id: updatedPrevious.id,
    metadata: { ...updatedPrevious.metadata, title, updatedAt: systemClock() },
    pageConfig: updatedPrevious.pageConfig,
    resources: resources.length ? resources : updatedPrevious.resources,
    content,
  };

  // Ordinary typing is applied as native engine transactions so IDs and the
  // engine's grouped undo history survive keystrokes.
  if (JSON.stringify(previous.content.map(blockShape)) === JSON.stringify(next.content.map(blockShape))) {
    const beforeBlocks = logicalTextBlocks(previous.content);
    const afterBlocks = logicalTextBlocks(next.content);
    if (beforeBlocks.length === afterBlocks.length) {
      const commands = [];
      for (let index = 0; index < beforeBlocks.length; index++) {
        const beforeText = getPlainText(beforeBlocks[index]);
        const afterText = getPlainText(afterBlocks[index]);
        if (beforeText === afterText) continue;
        const prefix = longestCommonPrefix(beforeText, afterText);
        const suffix = longestCommonSuffix(beforeText, afterText, prefix);
        commands.push(replaceRange({
          blockId: beforeBlocks[index].id,
          start: prefix,
          end: beforeText.length - suffix,
          text: afterText.slice(prefix, afterText.length - suffix),
        }));
      }
      if (commands.length) {
        const result = engine.exec(commands, { group: "typing" });
        if (result.ok) return true;
      } else return true;
    }
  }
  return engine.load(next).ok;
}

export function serializeNexusHtml(html: string, title: string): string {
  const engine = createEditor({ document: nexusDocumentFromHtml(html, title) });
  try {
    const result = engine.save();
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  } finally {
    engine.dispose();
  }
}

export function deserializeNexusHtml(payload: string): { html: string; title?: string } {
  const result = readNsx(payload, nextId);
  if (!result.ok) throw new Error(result.error.message);
  return { html: htmlFromNexusDocument(result.value), title: result.value.metadata.title };
}

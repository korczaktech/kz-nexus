import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_PAGE_CONFIG,
  createIdGenerator,
  exportHtml,
  layoutDocument,
  openNsx,
  saveNsx,
} from "./engine-bundle.js";

const newId = createIdGenerator("desktop");
const textRun = (text, marks = []) => ({ type: "text", id: newId(), text, marks });
const blockId = () => newId();

function marksFor(element) {
  const marks = [];
  for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
    const tag = node.tagName?.toLowerCase();
    if (tag === "strong" || tag === "b") marks.push({ type: "bold" });
    if (tag === "em" || tag === "i") marks.push({ type: "italic" });
    if (tag === "u") marks.push({ type: "underline" });
    if (tag === "s" || tag === "strike" || tag === "del") marks.push({ type: "strike" });
    if (tag === "a" && node.getAttribute("href")) marks.push({ type: "link", value: node.getAttribute("href") });
    const style = node.getAttribute?.("style") || "";
    const color = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
    const highlight = style.match(/(?:^|;)\s*background-color\s*:\s*([^;]+)/i);
    const size = style.match(/(?:^|;)\s*font-size\s*:\s*([\d.]+)(px|pt)?/i);
    const family = style.match(/(?:^|;)\s*font-family\s*:\s*([^;]+)/i);
    if (color) marks.push({ type: "color", value: color[1].trim() });
    if (highlight) marks.push({ type: "highlight", value: highlight[1].trim() });
    if (size) marks.push({ type: "fontSize", value: Number(size[1]) * (size[2]?.toLowerCase() === "pt" ? 1 : 0.75) });
    if (family) marks.push({ type: "fontFamily", value: family[1].trim().replace(/^['"]|['"]$/g, "") });
  }
  return marks;
}

function inlineRuns(element) {
  const runs = [];
  const walk = (node, inherited = []) => {
    if (node.nodeType === 3) {
      if (node.nodeValue) runs.push(textRun(node.nodeValue, inherited));
      return;
    }
    if (node.nodeType !== 1) return;
    const own = marksFor(node);
    const combined = [...inherited, ...own.filter(mark => !inherited.some(existing => existing.type === mark.type && existing.value === mark.value))];
    for (const child of node.childNodes) walk(child, combined);
  };
  for (const child of element.childNodes) walk(child);
  return runs.length ? runs : [textRun("")];
}

function paragraphFrom(element, type = "paragraph", level = 1) {
  const alignValue = element.style?.textAlign;
  const align = ({ left: "start", right: "end", center: "center", justify: "justify" })[alignValue];
  const block = { type, id: blockId(), children: inlineRuns(element) };
  if (type === "heading") block.level = level;
  if (align) block.align = align;
  const style = element.style || {};
  if (style.marginTop) block.spacingBefore = parseFloat(style.marginTop) * 0.75;
  if (style.marginBottom) block.spacingAfter = parseFloat(style.marginBottom) * 0.75;
  if (style.marginLeft) block.indent = parseFloat(style.marginLeft) * 0.75;
  if (style.backgroundColor) block.backgroundColor = style.backgroundColor;
  if (style.borderColor && style.borderWidth) {
    block.borderColor = style.borderColor;
    block.borderWidth = parseFloat(style.borderWidth) * 0.75;
  }
  if (style.padding) block.padding = parseFloat(style.padding) * 0.75;
  return block;
}

function convertList(element) {
  const ordered = element.tagName.toLowerCase() === "ol";
  return {
    type: ordered ? "orderedList" : "bulletList",
    id: blockId(),
    ...(ordered ? { start: Math.max(1, Number(element.getAttribute("start")) || 1) } : {}),
    children: [...element.children].filter(child => child.tagName.toLowerCase() === "li").map(li => ({
      type: "listItem",
      id: blockId(),
      children: [...li.children].map(child => convertBlock(child)).filter(Boolean),
    })),
  };
}

function convertBlock(element) {
  const tag = element.tagName.toLowerCase();
  if (/^h[1-6]$/.test(tag)) return paragraphFrom(element, "heading", Number(tag[1]));
  if (tag === "p" || tag === "div") return paragraphFrom(element);
  if (tag === "hr") return { type: "thematicBreak", id: blockId() };
  if (tag === "ul" || tag === "ol") return convertList(element);
  if (tag === "blockquote") {
    const children = [...element.children].filter(child => ["p", "div"].includes(child.tagName.toLowerCase())).map(child => paragraphFrom(child));
    return { type: "blockquote", id: blockId(), children: children.length ? children : [{ type: "paragraph", id: blockId(), children: inlineRuns(element) }] };
  }
  if (tag === "table") {
    return {
      type: "table", id: blockId(),
      children: [...element.querySelectorAll(":scope > tbody > tr, :scope > thead > tr, :scope > tfoot > tr, :scope > tr")].map(row => ({
        type: "tableRow", id: blockId(),
        children: [...row.children].filter(cell => ["td", "th"].includes(cell.tagName.toLowerCase())).map(cell => ({
          type: "tableCell", id: blockId(),
          children: [...cell.children].filter(child => ["p", "div", "h1", "h2", "h3", "h4", "h5", "h6"].includes(child.tagName.toLowerCase())).map(child => convertBlock(child)).filter(block => block?.type === "paragraph" || block?.type === "heading"),
        })),
      })),
    };
  }
  if (tag === "img") return null;
  if (element.textContent?.trim()) return paragraphFrom(element);
  return null;
}

export function htmlToNexusDocument(html, title = "Sem título", pageSize = "A4") {
  const parser = new DOMParser();
  const root = parser.parseFromString(String(html || ""), "text/html").body;
  const content = [];
  for (const child of root.children) {
    const block = convertBlock(child);
    if (block) content.push(block);
  }
  if (!content.length && root.textContent?.trim()) {
    content.push({ type: "paragraph", id: blockId(), children: [textRun(root.textContent.trim())] });
  }
  const letter = pageSize === "Letter";
  return {
    id: blockId(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    metadata: { title: String(title || "Sem título"), updatedAt: Date.now() },
    pageConfig: letter
      ? { ...DEFAULT_PAGE_CONFIG, width: 612, height: 792 }
      : { ...DEFAULT_PAGE_CONFIG, width: 595.28, height: 841.89 },
    content,
    resources: [],
  };
}

export function importNexusFile(text) {
  const result = openNsx(String(text || ""), createIdGenerator("import"));
  if (!result.ok) throw new Error(result.error.message || "O arquivo NSX é inválido.");
  return result.value;
}

export function nexusDocumentToHtml(document) {
  return exportHtml(document);
}

export function exportNexusFile(document) {
  const result = saveNsx(document);
  if (!result.ok) throw new Error(result.error.message || "Não foi possível serializar o documento NSX.");
  return result.value;
}

export function layoutNexusDocument(document) {
  return layoutDocument(document, { fontFamily: "Arial", keepHeadingsWithNext: true, keepParagraphsTogether: true });
}

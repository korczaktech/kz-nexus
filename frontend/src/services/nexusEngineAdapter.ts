import {
  createDocument,
  createEditor,
  createIdGenerator,
  readNsx,
  systemClock,
  writeNsx,
  type Block,
  type Mark,
  type NexusDocument,
  type TextRun,
} from "../../../packages/engine/src/index";

const nextId = createIdGenerator("nexus");
const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function marksFor(element: Element, inherited: Mark[]): Mark[] {
  const marks = [...inherited];
  const tag = element.tagName.toLowerCase();
  const add = (mark: Mark) => { if (!marks.some(item => item.type === mark.type)) marks.push(mark); };
  if (tag === "b" || tag === "strong") add({ type: "bold" });
  if (tag === "i" || tag === "em") add({ type: "italic" });
  if (tag === "u") add({ type: "underline" });
  if (tag === "s" || tag === "strike" || tag === "del") add({ type: "strike" });
  const style = (element as HTMLElement).style;
  if (style.color) add({ type: "color", value: style.color });
  if (style.backgroundColor) add({ type: "highlight", value: style.backgroundColor });
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

function makeParagraph(node: Element, type: "paragraph" | "heading" = "paragraph"): Extract<Block, { type: "paragraph" }> | Extract<Block, { type: "heading" }> {
  const children = inlineRuns(node);
  const runs = children.length ? children : [{ type: "text" as const, id: nextId(), text: "", marks: [] }];
  if (type === "heading") {
    const level = Math.min(6, Math.max(1, Number(node.tagName.slice(1)) || 1)) as 1 | 2 | 3 | 4 | 5 | 6;
    return { type: "heading", id: nextId(), level, children: runs };
  }
  const align = (node as HTMLElement).style.textAlign;
  return { type: "paragraph", id: nextId(), ...(align && ["left", "start", "center", "right", "end", "justify"].includes(align) ? { align: align === "left" ? "start" : align === "right" ? "end" : align as "start" | "center" | "end" | "justify" } : {}), children: runs };
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
    children: Array.from(row.children).filter(cell => ["td", "th"].includes(cell.tagName.toLowerCase())).map(cell => ({
      type: "tableCell" as const,
      id: nextId(),
      children: [makeParagraph(cell) as Extract<Block, { type: "paragraph" }>],
    })),
  })).filter(row => row.children.length > 0);
  return { type: "table", id: nextId(), children: rows };
}

function blocksFromHtml(html: string): Block[] {
  const parsed = new DOMParser().parseFromString(html || "<p></p>", "text/html");
  const blocks: Block[] = [];
  const visit = (element: Element) => {
    const tag = element.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) blocks.push(makeParagraph(element, "heading"));
    else if (tag === "p" || tag === "div" || tag === "pre") {
      if (tag === "div" && element.querySelector(":scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > ul, :scope > ol, :scope > table")) {
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
      blocks.push({ type: "paragraph", id: nextId(), children: [{ type: "text", id: nextId(), text: "[" + alt + "]", marks: [] }] });
    } else if (element.textContent?.trim()) blocks.push(makeParagraph(element));
  };
  Array.from(parsed.body.children).forEach(visit);
  if (!blocks.length) blocks.push({ type: "paragraph", id: nextId(), children: [{ type: "text", id: nextId(), text: "", marks: [] }] });
  return blocks;
}

export function nexusDocumentFromHtml(html: string, title = "Documento"): NexusDocument {
  const base = createDocument(nextId, systemClock, { title });
  return { ...base, content: blocksFromHtml(html) };
}

function renderRuns(runs: TextRun[]): string {
  return runs.map(run => {
    let text = escapeHtml(run.text).replace(/\n/g, "<br>");
    for (const mark of run.marks) {
      if (mark.type === "bold") text = "<strong>" + text + "</strong>";
      else if (mark.type === "italic") text = "<em>" + text + "</em>";
      else if (mark.type === "underline") text = "<u>" + text + "</u>";
      else if (mark.type === "strike") text = "<s>" + text + "</s>";
      else if (mark.type === "color") text = '<span style="color:' + escapeHtml(mark.value) + '">' + text + "</span>";
      else if (mark.type === "highlight") text = '<span style="background-color:' + escapeHtml(mark.value) + '">' + text + "</span>";
      else if (mark.type === "fontSize") text = '<span style="font-size:' + mark.value + 'px">' + text + "</span>";
      else if (mark.type === "fontFamily") text = '<span style="font-family:' + escapeHtml(mark.value) + '">' + text + "</span>";
    }
    return text;
  }).join("");
}

function renderBlock(block: Block): string {
  if (block.type === "paragraph") return "<p>" + renderRuns(block.children) + "</p>";
  if (block.type === "heading") return "<h" + block.level + ">" + renderRuns(block.children) + "</h" + block.level + ">";
  if (block.type === "blockquote") return "<blockquote>" + block.children.map(p => "<p>" + renderRuns(p.children) + "</p>").join("") + "</blockquote>";
  if (block.type === "thematicBreak") return "<hr>";
  if (block.type === "bulletList" || block.type === "orderedList") {
    const tag = block.type === "bulletList" ? "ul" : "ol";
    const start = block.type === "orderedList" && block.start !== 1 ? ' start="' + block.start + '"' : "";
    return "<" + tag + start + ">" + block.children.map(item => "<li>" + item.children.map(child => child.type === "paragraph" || child.type === "heading" ? renderBlock(child) : renderBlock(child)).join("") + "</li>").join("") + "</" + tag + ">";
  }
  if (block.type === "table") return "<table><tbody>" + block.children.map(row => "<tr>" + row.children.map(cell => "<td>" + cell.children.map(p => renderRuns(p.children)).join("<br>") + "</td>").join("") + "</tr>").join("") + "</tbody></table>";
  return "<p>[" + escapeHtml(block.alt) + "]</p>";
}

export function htmlFromNexusDocument(document: NexusDocument): string {
  return document.content.map(renderBlock).join("");
}

export function syncNexusEngine(engine: ReturnType<typeof createEditor>, html: string, title: string): boolean {
  const next = nexusDocumentFromHtml(html, title);
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

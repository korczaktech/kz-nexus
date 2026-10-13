import type { Block, ListItem, Mark, NexusDocument, Paragraph, Heading, TextRun } from "@korczak/nexus-engine";

const PT_TO_PX = 96 / 72;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const c of children) node.append(c);
  return node;
}

function renderRun(run: TextRun): HTMLElement {
  const span = el("span", { "data-run-id": run.id });
  span.textContent = run.text;
  const decorations: string[] = [];
  for (const mark of run.marks as Mark[]) {
    switch (mark.type) {
      case "bold": span.style.fontWeight = "700"; break;
      case "italic": span.style.fontStyle = "italic"; break;
      case "underline": decorations.push("underline"); break;
      case "strike": decorations.push("line-through"); break;
      case "color": span.style.color = mark.value; break;
      case "highlight": span.style.backgroundColor = mark.value; break;
      case "fontSize": span.style.fontSize = `${mark.value}pt`; break;
      case "fontFamily": span.style.fontFamily = `${JSON.stringify(mark.value)}, sans-serif`; break;
    }
  }
  if (decorations.length) span.style.textDecoration = decorations.join(" ");
  return span;
}

function renderTextBlock(block: Paragraph | Heading): HTMLElement {
  const tag = block.type === "heading" ? (`h${block.level}` as "h1") : "p";
  const node = el(tag, { "data-block-id": block.id });
  if (block.align) node.style.textAlign = block.align === "start" ? "left" : block.align === "end" ? "right" : block.align;
  let empty = true;
  for (const run of block.children) {
    if (run.text.length > 0) empty = false;
    node.append(renderRun(run));
  }
  if (empty) node.append(document.createElement("br"));
  return node;
}

function renderListItems(items: ListItem[]): HTMLElement[] {
  return items.map((item) => {
    const li = el("li", { "data-node-id": item.id });
    for (const child of item.children) {
      if (child.type === "paragraph") li.append(renderTextBlock(child));
      else li.append(renderBlock(child));
    }
    return li;
  });
}

function renderBlock(block: Block, doc?: NexusDocument): HTMLElement {
  switch (block.type) {
    case "paragraph":
    case "heading":
      return renderTextBlock(block);
    case "blockquote": {
      const q = el("blockquote", { "data-node-id": block.id });
      for (const p of block.children) q.append(renderTextBlock(p));
      return q;
    }
    case "thematicBreak":
      return el("hr", { "data-node-id": block.id, contenteditable: "false" });
    case "bulletList":
    case "orderedList": {
      const list = el(block.type === "orderedList" ? "ol" : "ul", { "data-node-id": block.id });
      if (block.type === "orderedList") list.setAttribute("start", String(block.start));
      list.append(...renderListItems(block.children));
      return list;
    }
    case "table": {
      const table = el("table", { "data-node-id": block.id });
      const body = el("tbody");
      for (const row of block.children) {
        const tr = el("tr", { "data-node-id": row.id });
        for (const cell of row.children) {
          const td = el("td", { "data-node-id": cell.id });
          for (const p of cell.children) td.append(renderTextBlock(p));
          tr.append(td);
        }
        body.append(tr);
      }
      table.append(body);
      return table;
    }
    case "image": {
      const figure = el("figure", { "data-node-id": block.id, "data-image-block": block.id, contenteditable: "false" });
      const resource = doc?.resources.find((r) => r.id === block.resourceId);
      if (resource) {
        const img = el("img", { alt: block.alt, src: `data:${resource.mimeType};base64,${resource.data}` });
        if (block.width) img.style.width = `${block.width * PT_TO_PX}px`;
        figure.append(img);
      } else {
        figure.append(el("div", { class: "missing-resource" }, `Recurso ausente: ${block.resourceId}`));
      }
      return figure;
    }
  }
}

/** Rebuilds the visual page from the canonical model. The DOM is a projection; it is never read back as data. */
export function renderDocument(doc: NexusDocument, root: HTMLElement): void {
  const page = el("article", { class: "page", "data-orientation": doc.pageConfig.orientation });
  const { width, height, margins } = doc.pageConfig;
  page.style.width = `${width * PT_TO_PX}px`;
  page.style.minHeight = `${height * PT_TO_PX}px`;
  page.style.padding = `${margins.top * PT_TO_PX}px ${margins.right * PT_TO_PX}px ${margins.bottom * PT_TO_PX}px ${margins.left * PT_TO_PX}px`;
  for (const block of doc.content) page.append(renderBlock(block, doc));
  root.replaceChildren(page);
}

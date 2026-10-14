import type { Block, NexusDocument, ResourceRef, TextRun } from "../model/types";

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderTextRunsHtml(runs: TextRun[]): string {
  return runs.map(run => {
    let text = escapeHtml(run.text).replace(/\n/g, "<br>");
    for (const mark of run.marks) {
      if (mark.type === "bold") text = "<strong>" + text + "</strong>";
      else if (mark.type === "italic") text = "<em>" + text + "</em>";
      else if (mark.type === "underline") text = "<u>" + text + "</u>";
      else if (mark.type === "strike") text = "<s>" + text + "</s>";
      else if (mark.type === "superscript") text = "<sup>" + text + "</sup>";
      else if (mark.type === "subscript") text = "<sub>" + text + "</sub>";
      else if (mark.type === "color") text = '<span style="color:' + escapeHtml(mark.value) + '">' + text + "</span>";
      else if (mark.type === "highlight") text = '<span style="background-color:' + escapeHtml(mark.value) + '">' + text + "</span>";
      else if (mark.type === "fontSize") text = '<span style="font-size:' + mark.value + 'px">' + text + "</span>";
      else if (mark.type === "fontFamily") text = '<span style="font-family:' + escapeHtml(mark.value) + '">' + text + "</span>";
      else if (mark.type === "link") text = '<a href="' + escapeHtml(mark.value) + '">' + text + "</a>";
      else if (mark.type === "comment") text = '<span data-kz-comment="' + escapeHtml(mark.value) + '" title="Comentário: ' + escapeHtml(mark.value) + '" style="background-color:#fef3c7;border-bottom:2px dotted #d97706">' + text + "</span>";
    }
    return text;
  }).join("");
}

function renderParagraph(block: Extract<Block, { type: "paragraph" | "heading" }>): string {
  const styles = [block.editorObject?.kind === "textBox" ? "border:1px solid " + (block.editorObject.stroke || "#94a3b8") : "", block.editorObject?.kind === "note" ? "border-left:3px solid " + (block.editorObject.stroke || "#d97706") : "", block.editorObject?.kind === "shape" ? "border:2px solid " + (block.editorObject.stroke || "#2563eb") : "", block.editorObject?.kind === "shape" && block.editorObject.shape === "ellipse" ? "border-radius:50%;aspect-ratio:1/1;max-width:160pt;display:flex;align-items:center;justify-content:center" : "", block.editorObject?.kind === "shape" && block.editorObject.shape === "triangle" ? "clip-path:polygon(50% 0,100% 100%,0 100%);min-height:72pt" : "", block.editorObject?.kind === "shape" && block.editorObject.shape === "rectangle" ? "min-height:48pt" : "", block.editorObject?.fill ? `background-color:${block.editorObject.fill}` : "", block.editorObject?.width ? `width:${block.editorObject.width}pt` : "", block.editorObject?.height ? `min-height:${block.editorObject.height}pt` : "", block.align ? `text-align:${block.align}` : "", block.indent ? `margin-left:${block.indent}pt` : "", block.firstLineIndent ? `text-indent:${block.firstLineIndent}pt` : "", block.hangingIndent ? `padding-left:${block.hangingIndent}pt;text-indent:-${block.hangingIndent}pt` : "", block.spacingBefore ? `margin-top:${block.spacingBefore}pt` : "", block.spacingAfter ? `margin-bottom:${block.spacingAfter}pt` : "", block.lineSpacing ? `line-height:${block.lineSpacing}` : "", block.backgroundColor ? `background-color:${block.backgroundColor}` : "", block.borderColor && block.borderWidth ? `border:${block.borderWidth}pt solid ${block.borderColor}` : "", block.padding ? `padding:${block.padding}pt` : ""].filter(Boolean).join(";");
  const style = styles ? ' style="' + escapeHtml(styles) + '"' : "";
  const objectAttrs = block.editorObject ? ` data-kz-object="${block.editorObject.kind}" data-kz-object-label="${escapeHtml(block.editorObject.label || "")}"${block.editorObject.shape ? ` data-kz-object-shape="${block.editorObject.shape}"` : ""}${block.editorObject.stroke ? ` data-kz-object-stroke="${escapeHtml(block.editorObject.stroke)}"` : ""}${block.editorObject.fill ? ` data-kz-object-fill="${escapeHtml(block.editorObject.fill)}"` : ""}${block.editorObject.width ? ` data-kz-object-width="${block.editorObject.width}"` : ""}${block.editorObject.height ? ` data-kz-object-height="${block.editorObject.height}"` : ""}` : "";
  if (block.type === "paragraph") return "<p" + objectAttrs + (block.anchorId ? ` id="${escapeHtml(block.anchorId)}"` : "") + style + ">" + renderTextRunsHtml(block.children) + "</p>";
  return '<h' + block.level + ' id="' + escapeHtml(block.id) + '"' + objectAttrs + style + ">" + renderTextRunsHtml(block.children) + "</h" + block.level + ">";
}

export function renderBlockHtml(block: Block, resources: ResourceRef[] = []): string {
  if (block.type === "paragraph" || block.type === "heading") return renderParagraph(block);
  if (block.type === "blockquote") return "<blockquote>" + block.children.map(child => renderParagraph(child)).join("") + "</blockquote>";
  if (block.type === "thematicBreak") return block.kind === "pageBreak" ? '<div data-kz-page-break="true" style="display:block;height:0;border-top:1px dashed #94a3b8;margin:12px 0;break-before:page;page-break-before:always" aria-label="Quebra de página"></div>' : "<hr>";
  if (block.type === "bulletList" || block.type === "orderedList") {
    const tag = block.type === "bulletList" ? "ul" : "ol";
    const start = block.type === "orderedList" && block.start !== 1 ? ' start="' + block.start + '"' : "";
    return "<" + tag + start + ">" + block.children.map(item => "<li>" + item.children.map(child => {
      if (child.type === "paragraph") return renderParagraph(child);
      return renderBlockHtml(child as Block, resources);
    }).join("") + "</li>").join("") + "</" + tag + ">";
  }
  if (block.type === "table") return "<table><tbody>" + block.children.map(row => "<tr>" + row.children.map(cell => "<td>" + cell.children.map(paragraph => renderParagraph(paragraph)).join("") + "</td>").join("") + "</tr>").join("") + "</tbody></table>";
  if (block.type === "image") {
    const resource = resources.find(item => item.id === block.resourceId);
    if (!resource) return "<p>[" + escapeHtml(block.alt) + "]</p>";
    const width = block.width ? ` width="${block.width}"` : "";
    const height = block.height ? ` height="${block.height}"` : "";
    return `<img data-nexus-image-id="${escapeHtml(block.id)}" src="data:${escapeHtml(resource.mimeType)};base64,${escapeHtml(resource.data)}" alt="${escapeHtml(block.alt)}"${width}${height} />`;
  }
  return "";
}

/** Renders the canonical engine document to safe HTML for web and desktop hosts. */
export function exportHtml(document: NexusDocument): string {
  return document.content.map(block => renderBlockHtml(block, document.resources)).join("");
}

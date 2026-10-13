import type { Block, NexusDocument, ResourceRef, TextRun } from "../model/types";

function escapeMarkdownText(value: string): string {
  const special = new Set(["\\", "*", "_", String.fromCharCode(96), "~", "[", "]", "|"]);
  return Array.from(value).map(character => special.has(character) ? "\\" + character : character).join("");
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderInline(runs: TextRun[]): string {
  return runs.map(run => {
    let text = escapeMarkdownText(run.text).replace(/\n/g, "<br>\n");
    for (const mark of run.marks) {
      if (mark.type === "bold") text = "**" + text + "**";
      else if (mark.type === "italic") text = "*" + text + "*";
      else if (mark.type === "underline") text = "<u>" + text + "</u>";
      else if (mark.type === "strike") text = "~~" + text + "~~";
      else if (mark.type === "superscript") text = "<sup>" + text + "</sup>";
      else if (mark.type === "subscript") text = "<sub>" + text + "</sub>";
      else if (mark.type === "color") text = '<span style="color:' + escapeHtmlAttribute(mark.value) + '">' + text + "</span>";
      else if (mark.type === "highlight") text = '<mark style="background-color:' + escapeHtmlAttribute(mark.value) + '">' + text + "</mark>";
      else if (mark.type === "fontSize") text = '<span style="font-size:' + mark.value + 'px">' + text + "</span>";
      else if (mark.type === "fontFamily") text = '<span style="font-family:' + escapeHtmlAttribute(mark.value) + '">' + text + "</span>";
      else if (mark.type === "link") text = "[" + text + "](" + mark.value.replace(/[()\s]/g, match => encodeURIComponent(match)) + ")";
    }
    return text;
  }).join("");
}

function paragraphText(block: Extract<Block, { type: "paragraph" | "heading" }>): string {
  return renderInline(block.children);
}

function renderBlock(block: Block, resources: ResourceRef[], depth = 0): string {
  if (block.type === "paragraph") return paragraphText(block);
  if (block.type === "heading") return "#".repeat(block.level) + " " + paragraphText(block);
  if (block.type === "blockquote") return block.children.map(child => paragraphText(child).split("\n").map(line => "> " + line).join("\n")).join("\n>\n");
  if (block.type === "thematicBreak") return "---";
  if (block.type === "bulletList" || block.type === "orderedList") {
    return block.children.map((item, index) => {
      const prefix = block.type === "bulletList" ? "- " : (block.start + index) + ". ";
      const children = item.children.map(child => child.type === "paragraph" ? paragraphText(child) : renderBlock(child as Block, resources, depth + 1));
      return "  ".repeat(depth) + prefix + children.join("\n" + "  ".repeat(depth + 1));
    }).join("\n");
  }
  if (block.type === "table") {
    if (!block.children.length) return "";
    const renderCell = (cell: typeof block.children[number]["children"][number]) => cell.children.map(paragraph => paragraphText(paragraph)).join("<br>").replace(/\|/g, "\\|");
    const rows = block.children.map(row => "| " + row.children.map(renderCell).join(" | ") + " |");
    const width = block.children[0]!.children.length;
    const divider = "| " + Array.from({ length: width }, () => "---").join(" | ") + " |";
    return [rows[0], divider, ...rows.slice(1)].join("\n");
  }
  if (block.type === "image") {
    const resource = resources.find(item => item.id === block.resourceId);
    return resource ? "![" + escapeMarkdownText(block.alt) + "](data:" + resource.mimeType + ";base64," + resource.data + ")" : "[" + escapeMarkdownText(block.alt) + "]";
  }
  return "";
}

/** Exports the canonical document to Markdown with HTML fallbacks for rich marks. */
export function exportMarkdown(document: NexusDocument): string {
  return document.content.map(block => renderBlock(block, document.resources)).join("\n\n").trimEnd() + "\n";
}

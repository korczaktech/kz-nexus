import { createIdGenerator, type IdGenerator } from "../core/ids";
import { systemClock, type Clock } from "../core/clock";
import { createDocument } from "../commands/document";
import { isValidLink } from "../schema/schema";
import type { Block, Mark, NexusDocument, Paragraph, ResourceRef, TextRun } from "../model/types";

interface MarkdownImportOptions {
  title?: string;
}

function run(text: string, marks: Mark[], generateId: IdGenerator): TextRun {
  return { type: "text", id: generateId(), text, marks: marks.map(mark => ({ ...mark } as Mark)) };
}

function inlineRuns(source: string, generateId: IdGenerator, inherited: Mark[] = []): TextRun[] {
  const result: TextRun[] = [];
  const token = /\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*\n]+\*|_[^_\n]+_|\[[^\]]+\]\([^)]+\)|<u>.*?<\/u>|<span\s+data-kz-comment="[^"]*">.*?<\/span>|<br\s*\/?\s*>/gi;
  let cursor = 0;
  for (const match of source.matchAll(token)) {
    const index = match.index ?? 0;
    if (index > cursor) result.push(run(source.slice(cursor, index), inherited, generateId));
    const value = match[0];
    if (/^<br/i.test(value)) result.push(run("\n", inherited, generateId));
    else if ((value.startsWith("**") && value.endsWith("**")) || (value.startsWith("__") && value.endsWith("__"))) {
      result.push(...inlineRuns(value.slice(2, -2), generateId, [...inherited, { type: "bold" }]));
    } else if (value.startsWith("~~")) {
      result.push(...inlineRuns(value.slice(2, -2), generateId, [...inherited, { type: "strike" }]));
    } else if (value.startsWith("<u>")) {
      result.push(...inlineRuns(value.slice(3, -4), generateId, [...inherited, { type: "underline" }]));
    } else if (value.startsWith("<span") && value.includes("data-kz-comment")) {
      const comment = /data-kz-comment="([^"]*)"/.exec(value)?.[1] ?? "";
      const inner = value.replace(/^<span\s+data-kz-comment="[^"]*">/i, "").replace(/<\/span>$/i, "");
      const decoded = comment.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
      if (decoded.trim() && decoded.length <= 2000) result.push(...inlineRuns(inner, generateId, [...inherited, { type: "comment", value: decoded }]));
      else result.push(run(value, inherited, generateId));
    } else if (value.startsWith("*") || value.startsWith("_")) {
      result.push(...inlineRuns(value.slice(1, -1), generateId, [...inherited, { type: "italic" }]));
    } else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(value);
      if (link && isValidLink(link[2]!)) result.push(...inlineRuns(link[1]!, generateId, [...inherited, { type: "link", value: link[2]! }]));
      else result.push(run(value, inherited, generateId));
    }
    cursor = index + value.length;
  }
  if (cursor < source.length) result.push(run(source.slice(cursor), inherited, generateId));
  return result.length ? result : [run("", inherited, generateId)];
}

function paragraph(source: string, generateId: IdGenerator): Paragraph {
  return { type: "paragraph", id: generateId(), children: inlineRuns(source, generateId) };
}

function splitCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split(/(?<!\\)\|/).map(cell => cell.replace(/\\\|/g, "|").trim());
}

function isTableDivider(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line);
}

function isBlockStart(lines: string[], index: number): boolean {
  const line = lines[index] ?? "";
  return /^#{1,6}\s+/.test(line) || /^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line) || /^>\s?/.test(line) ||
    /^\s*(?:[-*+]|\d+\.)\s+/.test(line) || (line.includes("|") && isTableDivider(lines[index + 1] ?? ""));
}

/** Imports the supported Markdown subset into the canonical, DOM-free engine model. */
export function importMarkdown(
  source: string,
  generateId: IdGenerator = createIdGenerator("markdown"),
  now: Clock = systemClock,
  options: MarkdownImportOptions = {},
): NexusDocument {
  const document = createDocument(generateId, now, { title: options.title ?? "Documento" });
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  const resources: ResourceRef[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) { index++; continue; }
    const image = /^!\[([^\]]*)\]\((data:image\/(?:png|jpeg|gif|webp|svg\+xml);base64,[a-z0-9+/=]+)\)$/i.exec(line.trim());
    if (image) {
      const [, alt, uri] = image;
      const comma = uri!.indexOf(",");
      const mimeType = uri!.slice(5, comma);
      const data = uri!.slice(comma + 1);
      const id = generateId();
      resources.push({ id, kind: "image", mimeType, data, byteLength: Math.floor(data.replace(/=+$/, "").length * 3 / 4), name: alt || "Imagem" });
      blocks.push({ type: "image", id: generateId(), resourceId: id, alt: alt || "Imagem" });
      index++;
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push({ type: "heading", id: generateId(), level: heading[1]!.length as 1 | 2 | 3 | 4 | 5 | 6, children: inlineRuns(heading[2]!, generateId) });
      index++;
      continue;
    }
    if (/^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      blocks.push({ type: "thematicBreak", id: generateId() });
      index++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const children: Paragraph[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index] ?? "")) {
        children.push(paragraph((lines[index] ?? "").replace(/^>\s?/, ""), generateId));
        index++;
      }
      blocks.push({ type: "blockquote", id: generateId(), children });
      continue;
    }
    if ((line.includes("|") && isTableDivider(lines[index + 1] ?? "")) && index + 1 < lines.length) {
      const headerCells = splitCells(line);
      index += 2;
      const rows: string[][] = [headerCells];
      while (index < lines.length && (lines[index] ?? "").includes("|") && (lines[index] ?? "").trim()) {
        rows.push(splitCells(lines[index] ?? ""));
        index++;
      }
      const columns = Math.max(1, ...rows.map(row => row.length));
      blocks.push({
        type: "table",
        id: generateId(),
        children: rows.map(cells => ({
          type: "tableRow" as const,
          id: generateId(),
          children: Array.from({ length: columns }, (_, column) => ({
            type: "tableCell" as const,
            id: generateId(),
            children: [paragraph(cells[column] ?? "", generateId)],
          })),
        })),
      });
      continue;
    }
    const listMatch = /^\s*([-*+]|(\d+)\.)\s+(.+)$/.exec(line);
    if (listMatch) {
      const ordered = Boolean(listMatch[2]);
      const items: { type: "listItem"; id: string; children: Paragraph[] }[] = [];
      const start = ordered ? Math.max(1, Number(listMatch[2]) || 1) : 1;
      while (index < lines.length) {
        const itemMatch = /^\s*([-*+]|(\d+)\.)\s+(.+)$/.exec(lines[index] ?? "");
        if (!itemMatch || Boolean(itemMatch[2]) !== ordered) break;
        items.push({ type: "listItem", id: generateId(), children: [paragraph(itemMatch[3]!, generateId)] });
        index++;
      }
      blocks.push(ordered
        ? { type: "orderedList", id: generateId(), start, children: items }
        : { type: "bulletList", id: generateId(), children: items });
      continue;
    }
    if (line.startsWith("```")) {
      const code: string[] = [];
      index++;
      while (index < lines.length && !(lines[index] ?? "").startsWith("```")) code.push(lines[index++] ?? "");
      if (index < lines.length) index++;
      blocks.push(paragraph(code.join("\n"), generateId));
      continue;
    }
    const textLines = [line];
    index++;
    while (index < lines.length && (lines[index] ?? "").trim() && !isBlockStart(lines, index)) textLines.push(lines[index++] ?? "");
    blocks.push(paragraph(textLines.join("\n"), generateId));
  }
  return { ...document, content: blocks.length ? blocks : document.content, resources };
}

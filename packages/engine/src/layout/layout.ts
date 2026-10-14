/**
 * Native deterministic layout engine for Korczak Nexus.
 *
 * Geometry is measured in points. Text metrics are injected by the host so a
 * browser, desktop or mobile host can use its actual font renderer. The
 * fallback measurer is deterministic and intentionally approximate.
 */
import type { Block, Heading, NexusDocument, PageConfig, Paragraph, TextRun } from "../model/types";

export interface TextMetrics {
  measureText(text: string, fontSize: number, fontFamily: string): number;
  lineHeight?(fontSize: number, fontFamily: string): number;
}
export interface LayoutOptions {
  fontFamily?: string;
  fontSize?: number;
  metrics?: TextMetrics;
  /** Block ids that must start on a fresh page (explicit page breaks). */
  breakBefore?: string[];
  /** Keep heading with its following block where possible. */
  keepHeadingsWithNext?: boolean;
  /** Prevent splitting paragraphs between pages where possible. */
  keepParagraphsTogether?: boolean;
}
export interface LayoutRect { x: number; y: number; width: number; height: number }
export interface LayoutLine { text: string; x: number; y: number; width: number; height: number; startOffset: number; endOffset: number }
export interface LayoutBlock {
  blockId: string;
  type: Block["type"];
  pageIndex: number;
  rect: LayoutRect;
  lines: LayoutLine[];
  table?: { rows: Array<{ rowId: string; rect: LayoutRect; cells: Array<{ cellId: string; rect: LayoutRect; lines: LayoutLine[] }> }> };
  continued?: boolean;
}
export interface LayoutPage {
  index: number;
  width: number;
  height: number;
  content: LayoutRect;
  blocks: LayoutBlock[];
}
export interface LayoutResult {
  pages: LayoutPage[];
  pageCount: number;
  diagnostics: Array<{ code: "OVERSIZED_BLOCK" | "INVALID_PAGE_CONFIG"; message: string; blockId?: string }>;
}
const PT_PER_INCH = 72;
const DEFAULT_FONT = 11;
const HEADING_SIZES: Record<number, number> = { 1: 24, 2: 20, 3: 16, 4: 14, 5: 12, 6: 11 };

function defaultMeasure(text: string, size: number): number {
  let width = 0;
  for (const char of text) {
    if (/\s/.test(char)) width += size * 0.28;
    else if (/[ilI.,'!:;|]/.test(char)) width += size * 0.25;
    else if (/[MW@#%&]/.test(char)) width += size * 0.82;
    else if (/[A-Z0-9]/.test(char)) width += size * 0.58;
    else width += size * 0.52;
  }
  return width;
}
function safeNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function textOf(runs: TextRun[]): string { return runs.map(run => run.text).join(""); }
function fontSizeOf(block: Paragraph | Heading, fallback: number): number {
  const sizes = block.children.flatMap(run => run.marks.filter(mark => mark.type === "fontSize").map(mark => mark.type === "fontSize" ? mark.value : fallback));
  return sizes.length ? Math.max(1, sizes[0]) : fallback;
}
function wrapText(text: string, maxWidth: number, fontSize: number, fontFamily: string, metrics?: TextMetrics): Array<{text:string;start:number;end:number;width:number}> {
  const measure = (value: string) => metrics ? metrics.measureText(value, fontSize, fontFamily) : defaultMeasure(value, fontSize);
  const result: Array<{text:string;start:number;end:number;width:number}> = [];
  const paragraphs = text.split("\n");
  let globalOffset = 0;
  for (const paragraph of paragraphs) {
    if (!paragraph.length) {
      result.push({ text: "", start: globalOffset, end: globalOffset, width: 0 });
      globalOffset += 1;
      continue;
    }
    const words = paragraph.match(/\S+\s*/g) || [paragraph];
    let line = "", start = globalOffset;
    for (const word of words) {
      const candidate = line + word;
      if (line && measure(candidate.trimEnd()) > maxWidth) {
        const clean = line.trimEnd();
        result.push({ text: clean, start, end: start + clean.length, width: measure(clean) });
        start += line.length;
        line = word.trimStart();
        if (measure(line) > maxWidth) {
          let piece = "";
          for (const char of line) {
            if (piece && measure(piece + char) > maxWidth) {
              result.push({ text: piece, start, end: start + piece.length, width: measure(piece) });
              start += piece.length; piece = char;
            } else piece += char;
          }
          line = piece;
        }
      } else line = candidate;
    }
    const clean = line.trimEnd();
    result.push({ text: clean, start, end: start + clean.length, width: measure(clean) });
    globalOffset += paragraph.length + 1;
  }
  return result;
}
function validPage(page: PageConfig): boolean {
  const m = page.margins;
  return [page.width,page.height,m.top,m.right,m.bottom,m.left].every(n => Number.isFinite(n) && n >= 0)
    && page.width > m.left + m.right && page.height > m.top + m.bottom;
}
function blockTextLayout(block: Paragraph | Heading, x: number, y: number, width: number, options: LayoutOptions): {lines: LayoutLine[];height:number} {
  const fallback = block.type === "heading" ? HEADING_SIZES[block.level] : safeNumber(options.fontSize, DEFAULT_FONT);
  const size = fontSizeOf(block, fallback);
  const family = options.fontFamily || "Arial";
  const available = Math.max(1, width - safeNumber(block.indent, 0) - safeNumber(block.padding, 0) * 2 - safeNumber(block.borderWidth, 0) * 2);
  const wrapped = wrapText(textOf(block.children), available, size, family, options.metrics);
  const natural = options.metrics?.lineHeight?.(size, family) ?? size * 1.2;
  const lineHeight = natural * safeNumber(block.lineSpacing, 1);
  const lines = wrapped.map((line, index) => ({
    text: line.text, x: x + safeNumber(block.indent, 0) + (index === 0 ? safeNumber(block.firstLineIndent, 0) : safeNumber(block.hangingIndent, 0)),
    y: y + safeNumber(block.padding, 0) + index * lineHeight, width: line.width, height: lineHeight,
    startOffset: line.start, endOffset: line.end
  }));
  return { lines, height: Math.max(lineHeight, wrapped.length * lineHeight) + safeNumber(block.padding, 0) * 2 + safeNumber(block.borderWidth, 0) * 2 };
}
function plainBlockText(block: Block): string {
  if (block.type === "paragraph" || block.type === "heading") return textOf(block.children);
  if (block.type === "blockquote") return block.children.map(textOf).join("\n");
  if (block.type === "bulletList" || block.type === "orderedList") return block.children.map(item => item.children.map(child => child.type === "paragraph" ? textOf(child.children) : "").join("\n")).join("\n");
  if (block.type === "table") return block.children.map(row => row.children.map(cell => cell.children.map(p => textOf(p.children)).join("\n")).join(" | ")).join("\n");
  if (block.type === "image") return block.alt;
  return "";
}

/** Calculates lines, content boxes, table cells, block positions and page breaks. */
export function layoutDocument(document: NexusDocument, options: LayoutOptions = {}): LayoutResult {
  const diagnostics: LayoutResult["diagnostics"] = [];
  const config = document.pageConfig;
  if (!validPage(config)) {
    diagnostics.push({ code: "INVALID_PAGE_CONFIG", message: "Dimensões da página ou margens inválidas; usando configuração padrão." });
  }
  const pageConfig = validPage(config) ? config : {
    unit: "pt" as const, width: 612, height: 792, orientation: "portrait" as const,
    margins: { top: 72, right: 72, bottom: 72, left: 72 }
  };
  const width = pageConfig.orientation === "landscape" ? Math.max(pageConfig.width, pageConfig.height) : Math.min(pageConfig.width, pageConfig.height);
  const height = pageConfig.orientation === "landscape" ? Math.min(pageConfig.width, pageConfig.height) : Math.max(pageConfig.width, pageConfig.height);
  const content = { x: pageConfig.margins.left, y: pageConfig.margins.top, width: width - pageConfig.margins.left - pageConfig.margins.right, height: height - pageConfig.margins.top - pageConfig.margins.bottom };
  const pages: LayoutPage[] = [];
  const makePage = (): LayoutPage => {
    const page: LayoutPage = { index: pages.length, width, height, content: { ...content }, blocks: [] };
    pages.push(page); return page;
  };
  let page = makePage(), cursorY = content.y;
  const nextPage = () => { page = makePage(); cursorY = content.y; };
  const addBlock = (block: Block, rect: LayoutRect, lines: LayoutLine[], extra: Partial<LayoutBlock> = {}) => {
    page.blocks.push({ blockId: block.id, type: block.type, pageIndex: page.index, rect, lines, ...extra });
  };
  const isForced = new Set(options.breakBefore || []);
  document.content.forEach((block, blockIndex) => {
    if (blockIndex > 0 && isForced.has(block.id)) nextPage();
    if (block.type === "thematicBreak") {
      const h = 1;
      if (cursorY + h > content.y + content.height) nextPage();
      addBlock(block, { x: content.x, y: cursorY, width: content.width, height: h }, []);
      cursorY += h + 10; return;
    }
    if (block.type === "image") {
      const resource = document.resources.find(item => item.id === block.resourceId);
      const naturalWidth = safeNumber(block.width, Math.min(content.width, 240));
      const naturalHeight = safeNumber(block.height, resource ? naturalWidth * 0.75 : 24);
      const scale = Math.min(1, content.width / Math.max(1, naturalWidth));
      const w = naturalWidth * scale, h = naturalHeight * scale;
      if (cursorY > content.y && cursorY + h > content.y + content.height) nextPage();
      addBlock(block, { x: content.x, y: cursorY, width: w, height: h }, []);
      cursorY += h + 8; return;
    }
    if (block.type === "table") {
      const columnCount = Math.max(1, ...block.children.map(row => row.children.length));
      const colWidth = content.width / columnCount;
      const rows: NonNullable<LayoutBlock["table"]>["rows"] = [];
      let totalHeight = 0;
      for (const row of block.children) {
        const cells = row.children.map((cell, cellIndex) => {
          const cellLines: LayoutLine[] = [];
          let cellHeight = 8;
          for (const paragraph of cell.children) {
            const measured = blockTextLayout(paragraph, content.x + cellIndex * colWidth + 4, cursorY + totalHeight + cellHeight, Math.max(1, colWidth - 8), options);
            cellLines.push(...measured.lines); cellHeight += measured.height;
          }
          return { cellId: cell.id, rect: { x: content.x + cellIndex * colWidth, y: cursorY + totalHeight, width: colWidth, height: cellHeight }, lines: cellLines, _height: cellHeight };
        });
        const rowHeight = Math.max(24, ...cells.map(cell => cell._height));
        rows.push({ rowId: row.id, rect: { x: content.x, y: cursorY + totalHeight, width: content.width, height: rowHeight }, cells: cells.map(({cellId,rect,lines})=>({cellId,rect:{...rect,height:rowHeight},lines})) });
        totalHeight += rowHeight;
      }
      if (cursorY > content.y && cursorY + totalHeight > content.y + content.height) nextPage();
      // Rows are kept intact. If a table exceeds a page, it is moved to the next page
      // when possible; oversized tables are split only at row boundaries.
      let tableY = cursorY;
      const positionedRows: typeof rows = [];
      for (const row of rows) {
        if (tableY > content.y && tableY + row.rect.height > content.y + content.height) { nextPage(); tableY = cursorY; }
        const dy = tableY - row.rect.y;
        positionedRows.push({ ...row, rect: { ...row.rect, y: tableY }, cells: row.cells.map(cell => ({ ...cell, rect: { ...cell.rect, y: cell.rect.y + dy }, lines: cell.lines.map(line => ({ ...line, y: line.y + dy })) })) });
        tableY += row.rect.height;
      }
      const lastPageIndex = page.index;
      const tableBlock: LayoutBlock = { blockId: block.id, type: "table", pageIndex: lastPageIndex, rect: { x: content.x, y: cursorY, width: content.width, height: totalHeight }, lines: [], table: { rows: positionedRows } };
      page.blocks.push(tableBlock);
      cursorY = tableY + 8;
      return;
    }
    if (block.type === "paragraph" || block.type === "heading") {
      const spacingBefore = safeNumber(block.spacingBefore, block.type === "heading" ? 8 : 0);
      const spacingAfter = safeNumber(block.spacingAfter, block.type === "heading" ? 5 : 6);
      const measured = blockTextLayout(block, content.x, cursorY + spacingBefore, content.width, options);
      const remaining = content.y + content.height - cursorY;
      if (cursorY > content.y && measured.height + spacingBefore + spacingAfter > remaining && (options.keepParagraphsTogether || (options.keepHeadingsWithNext && block.type === "heading"))) {
        nextPage();
      } else if (cursorY > content.y && measured.height + spacingBefore > remaining) {
        nextPage();
      }
      const positioned = blockTextLayout(block, content.x, cursorY + spacingBefore, content.width, options);
      if (positioned.height > content.height) diagnostics.push({ code: "OVERSIZED_BLOCK", message: "Bloco de texto maior que a área útil da página; as linhas permanecem disponíveis para o host paginar.", blockId: block.id });
      addBlock(block, { x: content.x, y: cursorY + spacingBefore, width: content.width, height: positioned.height }, positioned.lines);
      cursorY += spacingBefore + positioned.height + spacingAfter;
      return;
    }
    const text = plainBlockText(block);
    const measured = wrapText(text, content.width - 20, safeNumber(options.fontSize, DEFAULT_FONT), options.fontFamily || "Arial", options.metrics);
    const lineHeight = safeNumber(options.fontSize, DEFAULT_FONT) * 1.25;
    const blockHeight = Math.max(lineHeight, measured.length * lineHeight) + 8;
    if (cursorY > content.y && cursorY + blockHeight > content.y + content.height) nextPage();
    const lines = measured.map((line,index)=>({text:line.text,x:content.x+20,y:cursorY+index*lineHeight,width:line.width,height:lineHeight,startOffset:line.start,endOffset:line.end}));
    addBlock(block, { x: content.x, y: cursorY, width: content.width, height: blockHeight }, lines);
    cursorY += blockHeight + 6;
  });
  // Empty documents still have one physical page.
  return { pages, pageCount: pages.length, diagnostics };
}

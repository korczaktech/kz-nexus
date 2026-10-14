/**
 * Native deterministic layout engine for Korczak Nexus.
 *
 * Geometry is measured in points. Text metrics are injected by the host so a
 * browser, desktop or mobile host can use its actual font renderer. The
 * fallback measurer is deterministic and intentionally approximate.
 */
import type { Alignment, Block, BulletList, Heading, ListItem, NexusDocument, OrderedList, PageConfig, Paragraph, TextRun } from "../model/types";

export interface TextMetrics {
  measureText(text: string, fontSize: number, fontFamily: string, marks?: TextRun["marks"]): number;
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
export interface LayoutTextRun {
  text: string;
  startOffset: number;
  endOffset: number;
  fontSize: number;
  fontFamily: string;
  marks: TextRun["marks"];
  width: number;
}
export interface LayoutLine { text: string; x: number; y: number; width: number; height: number; startOffset: number; endOffset: number; align?: Alignment; runs?: LayoutTextRun[] }
export interface LayoutBlockStyle {
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  padding?: number;
  align?: Alignment;
}
export interface LayoutBlock {
  blockId: string;
  type: Block["type"] | "listItem";
  pageIndex: number;
  rect: LayoutRect;
  lines: LayoutLine[];
  children?: LayoutBlock[];
  marker?: string;
  depth?: number;
  quote?: boolean;
  style?: LayoutBlockStyle;
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
        line = "";
      }
      const token = line ? word : word.trimStart();
      if (!line && measure(token) > maxWidth) {
        let piece = "";
        for (const char of token) {
          if (piece && measure(piece + char) > maxWidth) {
            result.push({ text: piece, start, end: start + piece.length, width: measure(piece) });
            start += piece.length;
            piece = char;
          } else piece += char;
        }
        line = piece;
      } else line += token;
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
  const fallbackSize = block.type === "heading" ? HEADING_SIZES[block.level] : safeNumber(options.fontSize, DEFAULT_FONT);
  const familyFallback = options.fontFamily || "Arial";
  const available = Math.max(1, width - safeNumber(block.indent, 0) - safeNumber(block.padding, 0) * 2 - safeNumber(block.borderWidth, 0) * 2);
  const source = textOf(block.children);
  const charStyle: Array<{runIndex:number;fontSize:number;fontFamily:string}> = [];
  block.children.forEach((run, runIndex) => {
    const sizeMark = run.marks.find(mark => mark.type === "fontSize");
    const familyMark = run.marks.find(mark => mark.type === "fontFamily");
    const fontSize = sizeMark && sizeMark.type === "fontSize" ? Math.max(1, sizeMark.value * 0.75) : fallbackSize;
    const fontFamily = familyMark && familyMark.type === "fontFamily" ? familyMark.value : familyFallback;
    for (let i = 0; i < run.text.length; i++) charStyle.push({ runIndex, fontSize, fontFamily });
  });
  const measureRange = (start:number, end:number):number => {
    let total = 0, cursor = start;
    while (cursor < end) {
      const style = charStyle[cursor] || { runIndex: 0, fontSize: fallbackSize, fontFamily: familyFallback };
      let stop = cursor + 1;
      while (stop < end && charStyle[stop]?.runIndex === style.runIndex) stop++;
      const chunk = source.slice(cursor, stop);
      total += options.metrics ? options.metrics.measureText(chunk, style.fontSize, style.fontFamily, block.children[style.runIndex]?.marks || []) : defaultMeasure(chunk, style.fontSize);
      cursor = stop;
    }
    return total;
  };
  const buildRuns = (start:number,end:number):LayoutTextRun[] => {
    const result:LayoutTextRun[]=[];
    let cursor=start;
    while(cursor<end){
      const style=charStyle[cursor]||{runIndex:0,fontSize:fallbackSize,fontFamily:familyFallback};
      let stop=cursor+1;
      while(stop<end&&charStyle[stop]?.runIndex===style.runIndex)stop++;
      const original=block.children[style.runIndex];
      const marks=original?.marks||[];
      result.push({text:source.slice(cursor,stop),startOffset:cursor,endOffset:stop,fontSize:style.fontSize,fontFamily:style.fontFamily,marks,width:measureRange(cursor,stop)});
      cursor=stop;
    }
    return result;
  };
  const wrapped:Array<{text:string;start:number;end:number;width:number;runs:LayoutTextRun[];height:number}>=[];
  const paragraphs=source.split("\n");
  let globalOffset=0;
  for(const paragraph of paragraphs){
    if(!paragraph.length){
      const size=fallbackSize, natural=options.metrics?.lineHeight?.(size,familyFallback)??size*1.2;
      wrapped.push({text:"",start:globalOffset,end:globalOffset,width:0,runs:[],height:natural*safeNumber(block.lineSpacing,1)});
      globalOffset+=1;continue;
    }
    const tokens=paragraph.match(/\S+\s*/g)||[paragraph];
    let lineStart=globalOffset,lineEnd=globalOffset,lineText="";
    const pushLine=(start:number,end:number,text:string)=>{
      const clean=text.trimEnd();
      const actualEnd=start+clean.length;
      const runs=buildRuns(start,actualEnd);
      const naturalHeights=runs.map(run=>options.metrics?.lineHeight?.(run.fontSize,run.fontFamily)??run.fontSize*1.2);
      const height=(naturalHeights.length?Math.max(...naturalHeights):((options.metrics?.lineHeight?.(fallbackSize,familyFallback)??fallbackSize*1.2)))*safeNumber(block.lineSpacing,1);
      wrapped.push({text:clean,start,end:actualEnd,width:measureRange(start,actualEnd),runs,height});
    };
    let tokenOffset=globalOffset;
    for(const token of tokens){
      let candidate=lineText+token;
      if(lineText&&measureRange(lineStart,tokenOffset+token.length)>available){
        pushLine(lineStart,tokenOffset,lineText);
        lineStart=tokenOffset;lineText="";candidate=token.trimStart();
      }
      if(!lineText&&measureRange(tokenOffset,tokenOffset+token.trimEnd().length)>available){
        let pieceStart=tokenOffset,piece="";
        for(let i=0;i<token.trimEnd().length;i++){
          const char=token.trimEnd()[i];
          if(piece&&measureRange(pieceStart,pieceStart+piece.length+1)>available){
            pushLine(pieceStart,pieceStart+piece.length,piece);
            pieceStart+=piece.length;piece=char;
          }else piece+=char;
        }
        lineStart=pieceStart;lineText=piece;
        if(token.endsWith(" "))lineText+=" ";
      }else lineText+=lineText?token:token.trimStart();
      tokenOffset+=token.length;
    }
    pushLine(lineStart,tokenOffset,lineText);
    globalOffset+=paragraph.length+1;
  }
  const align = block.align || "start";
  let yOffset=safeNumber(block.padding,0);
  const lines=wrapped.map((line,index)=>{
    const indent=safeNumber(block.indent,0)+(index===0?safeNumber(block.firstLineIndent,0):safeNumber(block.hangingIndent,0));
    const leftInset=safeNumber(block.padding,0)+safeNumber(block.borderWidth,0);
    const alignedX=align==="center"?x+leftInset+safeNumber(block.indent,0)+(available-line.width)/2
      :align==="end"?x+leftInset+safeNumber(block.indent,0)+available-line.width:x+leftInset+indent;
    const result:LayoutLine={text:line.text,x:alignedX,y:y+yOffset,width:align==="justify"&&index<wrapped.length-1?Math.max(1,available-indent):line.width,
      height:line.height,startOffset:line.start,endOffset:line.end,align,runs:line.runs};
    yOffset+=line.height;
    return result;
  });
  return {lines,height:Math.max(wrapped.reduce((sum,line)=>sum+line.height,0),options.metrics?.lineHeight?.(fallbackSize,familyFallback)??fallbackSize*1.2)+safeNumber(block.padding,0)*2+safeNumber(block.borderWidth,0)*2};
}
function plainBlockText(block: Block): string {
  if (block.type === "paragraph" || block.type === "heading") return textOf(block.children);
  if (block.type === "blockquote") return block.children.map(paragraph => "│ " + textOf(paragraph.children)).join("\n");
  if (block.type === "bulletList" || block.type === "orderedList") {
    const renderItems = (items: Array<{ children: Array<any> }>, depth: number, ordered: boolean, start: number): string[] =>
      items.flatMap((item, index) => {
        const marker = ordered ? String(start + index) + "." : "•";
        const prefix = "↳ ".repeat(depth) + marker + " ";
        const own = item.children.flatMap((child: any) => child.type === "paragraph" ? [prefix + textOf(child.children)]
          : child.type === "bulletList" ? renderItems(child.children, depth + 1, false, 1)
          : child.type === "orderedList" ? renderItems(child.children, depth + 1, true, child.start) : []);
        return own.length ? own : [prefix];
      });
    return renderItems(block.children, 0, block.type === "orderedList", block.type === "orderedList" ? block.start : 1).join("\n");
  }
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
  const styleForParagraph = (block: Paragraph | Heading): LayoutBlockStyle => ({
    backgroundColor: block.backgroundColor, borderColor: block.borderColor,
    borderWidth: block.borderWidth, padding: block.padding, align: block.align
  });
  const addBlock = (block: Block, rect: LayoutRect, lines: LayoutLine[], extra: Partial<LayoutBlock> = {}) => {
    const style = block.type === "paragraph" || block.type === "heading" ? styleForParagraph(block) : undefined;
    page.blocks.push({ blockId: block.id, type: block.type, pageIndex: page.index, rect, lines, ...(style ? { style } : {}), ...extra });
  };
  const paragraphChild = (paragraph: Paragraph, x: number, y: number, width: number): LayoutBlock => {
    const measured = blockTextLayout(paragraph, x, y, width, options);
    return { blockId: paragraph.id, type: "paragraph", pageIndex: page.index,
      rect: { x, y, width, height: measured.height }, lines: measured.lines, style: styleForParagraph(paragraph) };
  };
  const listItemHeight = (item: ListItem, depth: number): number => {
    let total = 4;
    for (const child of item.children) {
      if (child.type === "paragraph") {
        total += safeNumber(child.spacingBefore, 0) + blockTextLayout(child, 0, 0,
          Math.max(1, content.width - (depth + 1) * 18), options).height + safeNumber(child.spacingAfter, 6);
      } else {
        total += listHeight(child, depth + 1);
      }
    }
    return Math.max(12, total);
  };
  const listHeight = (list: BulletList | OrderedList, depth: number): number =>
    list.children.reduce((sum, item) => sum + listItemHeight(item, depth) + 2, 0);
  const buildListItem = (item: ListItem, marker: string, depth: number, y: number): { block: LayoutBlock; height: number } => {
    const children: LayoutBlock[] = [];
    let childY = y + 2;
    for (const child of item.children) {
      if (child.type === "paragraph") {
        childY += safeNumber(child.spacingBefore, 0);
        const x = content.x + (depth + 1) * 18;
        const width = Math.max(1, content.width - (depth + 1) * 18);
        const laidOut = paragraphChild(child, x, childY, width);
        children.push(laidOut);
        childY += laidOut.rect.height + safeNumber(child.spacingAfter, 6);
      } else {
        const nested = buildListNode(child, depth + 1, childY);
        children.push(nested.block);
        childY += nested.height;
      }
    }
    const height = Math.max(12, childY - y + 2);
    return { block: { blockId: item.id, type: "listItem", pageIndex: page.index,
      rect: { x: content.x + depth * 18, y, width: Math.max(1, content.width - depth * 18), height },
      lines: [], children, marker, depth }, height };
  };
  const buildListNode = (list: BulletList | OrderedList, depth: number, y: number): { block: LayoutBlock; height: number } => {
    const children: LayoutBlock[] = [];
    let childY = y;
    list.children.forEach((item, index) => {
      const marker = list.type === "orderedList" ? String(list.start + index) + "." : "•";
      const laidOut = buildListItem(item, marker, depth, childY);
      children.push(laidOut.block);
      childY += laidOut.height + 2;
    });
    const height = Math.max(0, childY - y);
    return { block: { blockId: list.id, type: list.type, pageIndex: page.index,
      rect: { x: content.x + depth * 18, y, width: Math.max(1, content.width - depth * 18), height },
      lines: [], children, depth }, height };
  };
  const isForced = new Set(options.breakBefore || []);
  document.content.forEach((block, blockIndex) => {
    if (blockIndex > 0 && (isForced.has(block.id) || ((block.type === "paragraph" || block.type === "heading") && (block as { pageBreakBefore?: boolean }).pageBreakBefore))) nextPage();
    if (block.type === "thematicBreak") {
      if (block.kind === "pageBreak") {
        if (blockIndex > 0 || cursorY > content.y) nextPage();
        addBlock(block, { x: content.x, y: cursorY, width: content.width, height: 0 }, []);
        return;
      }
      const h = 1;
      if (cursorY + h > content.y + content.height) nextPage();
      addBlock(block, { x: content.x, y: cursorY, width: content.width, height: h }, []);
      cursorY += h + 10; return;
    }
    if (block.type === "image") {
      const resource = document.resources.find(item => item.id === block.resourceId);
      const naturalWidth = safeNumber(block.width, Math.min(content.width, 240));
      const naturalHeight = safeNumber(block.height, resource ? naturalWidth * 0.75 : 24);
      // Fit the image to both page dimensions, not only its width. This avoids
      // silently placing a very tall image outside the printable area.
      const scale = Math.min(1, content.width / Math.max(1, naturalWidth), content.height / Math.max(1, naturalHeight));
      const w = naturalWidth * scale, h = naturalHeight * scale;
      if (scale < 1) diagnostics.push({ code: "OVERSIZED_BLOCK", message: "Imagem reduzida proporcionalmente para caber na área útil da página.", blockId: block.id });
      if (cursorY > content.y && cursorY + h > content.y + content.height) nextPage();
      addBlock(block, { x: content.x, y: cursorY, width: w, height: h }, []);
      cursorY += h + 8; return;
    }
    if (block.type === "table") {
      const columnCount = Math.max(1, ...block.children.map(row => row.children.length));
      const colWidth = content.width / columnCount;
      const rowLayouts = block.children.map(row => {
        const cells = row.children.map((cell, cellIndex) => {
          const measuredParagraphs = cell.children.map(paragraph => blockTextLayout(
            paragraph, content.x + cellIndex * colWidth + 4, 0, Math.max(1, colWidth - 8), options
          ));
          const cellHeight = 8 + measuredParagraphs.reduce((sum, item) => sum + item.height, 0);
          return { cellId: cell.id, x: content.x + cellIndex * colWidth, width: colWidth, height: cellHeight, paragraphs: measuredParagraphs };
        });
        return { rowId: row.id, height: Math.max(24, ...cells.map(cell => cell.height)), cells };
      });
      let fragmentRows: NonNullable<LayoutBlock["table"]>["rows"] = [];
      let fragmentStartY = cursorY;
      let fragmentHeight = 0;
      let fragmentIndex = 0;
      const flushTableFragment = () => {
        if (!fragmentRows.length) return;
        page.blocks.push({
          blockId: block.id, type: "table", pageIndex: page.index,
          rect: { x: content.x, y: fragmentStartY, width: content.width, height: fragmentHeight },
          lines: [], table: { rows: fragmentRows }, continued: fragmentIndex > 0
        });
        fragmentIndex += 1;
        fragmentRows = []; fragmentHeight = 0;
      };
      for (const row of rowLayouts) {
        if (row.height > content.height) {
          // Keep a pathological row's text intact by splitting the row between
          // line boundaries. Each page fragment retains every cell and line.
          if (cursorY > content.y) {
            flushTableFragment();
            nextPage();
            fragmentStartY = cursorY;
          }
          const cellLines = row.cells.map((cell, cellIndex) => {
            let localY = 4;
            const lines: LayoutLine[] = [];
            for (const paragraph of cell.paragraphs) {
              lines.push(...paragraph.lines.map(line => ({
                ...line,
                x: cell.x + 4 + (line.x - (content.x + cellIndex * colWidth + 4)),
                y: localY + line.y
              })));
              localY += paragraph.height;
            }
            return { cell, lines };
          });
          const allLines = cellLines.flatMap(item => item.lines);
          const allLineBottoms = allLines.map(line => line.y + line.height);
          let offset = 0;
          while (offset < row.height - 0.001) {
            const available = content.y + content.height - cursorY;
            if (available <= 0.001) {
              flushTableFragment();
              nextPage();
              fragmentStartY = cursorY;
              continue;
            }
            let nextOffset = Math.min(row.height, offset + available);
            const safeBoundaries = allLineBottoms.filter(bottom =>
              bottom > offset + 0.001 && bottom <= offset + available + 0.001 &&
              allLines.every(line => !(line.y < bottom - 0.001 && line.y + line.height > bottom + 0.001))
            );
            const boundary = safeBoundaries.reduce((best, bottom) => Math.max(best, bottom), offset);
            if (boundary > offset + 0.001) {
              nextOffset = Math.min(row.height, boundary);
              // Keep the final bottom padding with the last line fragment.
              if (row.height - nextOffset <= 8) nextOffset = row.height;
            }
            const chunkHeight = Math.max(0.001, nextOffset - offset);
            const rowY = cursorY;
            const cells = cellLines.map(({ cell, lines }) => ({
              cellId: cell.cellId,
              rect: { x: cell.x, y: rowY, width: cell.width, height: chunkHeight },
              lines: lines.filter(line => line.y < nextOffset && line.y + line.height > offset)
                .map(line => ({ ...line, y: rowY + line.y - offset }))
            }));
            if (cells.some(cell => cell.lines.some(line => line.height > content.height))) {
              diagnostics.push({ code: "OVERSIZED_BLOCK", message: "Uma linha de texto dentro de uma célula é maior que a área útil da página.", blockId: block.id });
            }
            fragmentRows.push({
              rowId: row.rowId,
              rect: { x: content.x, y: rowY, width: content.width, height: chunkHeight },
              cells
            });
            cursorY += chunkHeight;
            fragmentHeight += chunkHeight;
            // Emit a row fragment at each page boundary; table.continued marks
            // every fragment after the first one.
            const remaining = row.height - nextOffset;
            offset = nextOffset;
            if (remaining > 0.001) {
              flushTableFragment();
              nextPage();
              fragmentStartY = cursorY;
            }
          }
          continue;
        }
        if (cursorY > content.y && cursorY + row.height > content.y + content.height) {
          flushTableFragment(); nextPage(); fragmentStartY = cursorY;
        }
        const rowY = cursorY;
        const cells = row.cells.map(cell => {
          let cellY = rowY + 4;
          const lines: LayoutLine[] = [];
          for (const paragraph of cell.paragraphs) {
            lines.push(...paragraph.lines.map(line => ({ ...line, x: cell.x + 4 + (line.x - (content.x + (row.cells.indexOf(cell)) * colWidth + 4)), y: cellY + line.y })));
            cellY += paragraph.height;
          }
          return { cellId: cell.cellId, rect: { x: cell.x, y: rowY, width: cell.width, height: row.height }, lines };
        });
        fragmentRows.push({ rowId: row.rowId, rect: { x: content.x, y: rowY, width: content.width, height: row.height }, cells });
        cursorY += row.height; fragmentHeight += row.height;
      }
      flushTableFragment();
      cursorY += 8;
      return;
    }
    if (block.type === "blockquote") {
      let fragmentChildren: LayoutBlock[] = [];
      let fragmentStartY = cursorY;
      let fragmentIndex = 0;
      let lastSpacing = 0;
      const flushQuote = () => {
        if (!fragmentChildren.length) return;
        page.blocks.push({ blockId: block.id, type: "blockquote", pageIndex: page.index,
          rect: { x: content.x, y: fragmentStartY, width: content.width,
            height: Math.max(0, cursorY - fragmentStartY - lastSpacing) },
          lines: [], children: fragmentChildren, quote: true, continued: fragmentIndex > 0 });
        fragmentIndex += 1;
        fragmentChildren = [];
        lastSpacing = 0;
      };
      for (const paragraph of block.children) {
        const x = content.x + 14;
        const availableWidth = Math.max(1, content.width - 14);
        const measured = blockTextLayout(paragraph, x, cursorY, availableWidth, options);
        const spacing = safeNumber(paragraph.spacingAfter, 6);
        let lineOffset = 0;
        let firstFragment = true;
        while (lineOffset < measured.lines.length) {
          const topInset = firstFragment ? safeNumber(paragraph.padding, 0) + safeNumber(paragraph.borderWidth, 0) : 0;
          let available = content.y + content.height - cursorY - topInset;
          if (available < measured.lines[lineOffset].height && cursorY > content.y) {
            flushQuote();
            nextPage();
            fragmentStartY = cursorY;
            available = content.y + content.height - cursorY - topInset;
          }
          let count = 0;
          let lineHeightSum = 0;
          while (lineOffset + count < measured.lines.length) {
            const nextHeight = measured.lines[lineOffset + count].height;
            if (count > 0 && lineHeightSum + nextHeight > available + 0.001) break;
            if (count === 0 && nextHeight > available && cursorY > content.y) break;
            lineHeightSum += nextHeight;
            count += 1;
          }
          if (count === 0) {
            // A single glyph line can be taller than the page only when the
            // document uses an extreme font size; place it once and diagnose it.
            count = 1;
            lineHeightSum = measured.lines[lineOffset].height;
            diagnostics.push({ code: "OVERSIZED_BLOCK", message: "Uma linha da citação é maior que a área útil da página e não pode ser dividida.", blockId: paragraph.id });
          }
          const isLastFragment = lineOffset + count >= measured.lines.length;
          const bottomInset = isLastFragment ? safeNumber(paragraph.padding, 0) + safeNumber(paragraph.borderWidth, 0) : 0;
          const fragmentHeight = topInset + lineHeightSum + bottomInset;
          const firstLineY = measured.lines[lineOffset].y;
          const lines = measured.lines.slice(lineOffset, lineOffset + count).map(line => ({
            ...line, y: cursorY + topInset + (line.y - firstLineY)
          }));
          fragmentChildren.push({
            blockId: paragraph.id, type: "paragraph", pageIndex: page.index,
            rect: { x, y: cursorY, width: availableWidth, height: fragmentHeight }, lines,
            style: styleForParagraph(paragraph)
          });
          cursorY += fragmentHeight;
          lineOffset += count;
          firstFragment = false;
          if (lineOffset < measured.lines.length) {
            flushQuote();
            nextPage();
            fragmentStartY = cursorY;
          }
        }
        cursorY += spacing;
        lastSpacing = spacing;
      }
      flushQuote();
      cursorY += 4;
      return;
    }
    if (block.type === "bulletList" || block.type === "orderedList") {
      let fragmentChildren: LayoutBlock[] = [];
      let fragmentStartY = cursorY;
      let fragmentIndex = 0;
      let lastSpacing = 2;
      const flushList = () => {
        if (!fragmentChildren.length) return;
        page.blocks.push({ blockId: block.id, type: block.type, pageIndex: page.index,
          rect: { x: content.x, y: fragmentStartY, width: content.width,
            height: Math.max(0, cursorY - fragmentStartY - lastSpacing) },
          lines: [], children: fragmentChildren, continued: fragmentIndex > 0 });
        fragmentIndex += 1;
        fragmentChildren = [];
        lastSpacing = 2;
      };
      for (let index = 0; index < block.children.length; index++) {
        const item = block.children[index];
        const itemHeight = listItemHeight(item, 0);
        if (cursorY > content.y && cursorY + itemHeight > content.y + content.height) {
          flushList();
          nextPage();
          fragmentStartY = cursorY;
        }
        const marker = block.type === "orderedList" ? String(block.start + index) + "." : "•";
        if (itemHeight > content.height && item.children.some(child => child.type !== "paragraph")) {
          // Build the complete nested hierarchy once, then paginate its tree at
          // line boundaries. Clipping the tree (rather than flattening it) keeps
          // nested list types, item IDs, styles and markers intact.
          const complete = buildListItem(item, marker, 0, cursorY).block;
          const lineBottoms: number[] = [];
          const collectLineBottoms = (node: LayoutBlock) => {
            node.lines.forEach(line => lineBottoms.push(line.y + line.height));
            node.children?.forEach(collectLineBottoms);
          };
          collectLineBottoms(complete);
          const shownMarkers = new Set<string>();
          const clipTree = (node: LayoutBlock, fromY: number, toY: number, delta: number): LayoutBlock | null => {
            if (node.children?.length) {
              const children = node.children.map(child => clipTree(child, fromY, toY, delta)).filter((child): child is LayoutBlock => child !== null);
              if (!children.length) return null;
              const top = Math.min(...children.map(child => child.rect.y));
              const bottom = Math.max(...children.map(child => child.rect.y + child.rect.height));
              const marker = node.type === "listItem" && shownMarkers.has(node.blockId) ? undefined : node.marker;
              if (node.type === "listItem" && node.marker) shownMarkers.add(node.blockId);
              return { ...node, pageIndex: page.index, rect: { ...node.rect, y: top, height: Math.max(0, bottom - top) }, children, marker };
            }
            const lines = node.lines.filter(line =>
              line.y >= fromY - 0.001 && line.y + line.height <= toY + 0.001
            ).map(line => ({ ...line, y: line.y + delta }));
            if (!lines.length) return null;
            const top = Math.min(...lines.map(line => line.y));
            const bottom = Math.max(...lines.map(line => line.y + line.height));
            return { ...node, pageIndex: page.index, rect: { ...node.rect, y: top, height: bottom - top }, lines };
          };
          let segmentStart = cursorY;
          let remainingHeight = Math.max(0, content.y + content.height - cursorY);
          const finalBottom = complete.rect.y + complete.rect.height;
          while (segmentStart < finalBottom - 0.001) {
            if (remainingHeight <= 0.001) {
              flushList();
              nextPage();
              fragmentStartY = cursorY;
              remainingHeight = content.height;
            }
            const maxBoundary = segmentStart + remainingHeight;
            const safeBoundary = lineBottoms
              .filter(bottom => bottom > segmentStart + 0.001 && bottom <= maxBoundary + 0.001)
              .reduce((best, bottom) => Math.max(best, bottom), segmentStart);
            const nextLineBottom = lineBottoms
              .filter(bottom => bottom > segmentStart + 0.001)
              .reduce((best, bottom) => best === 0 ? bottom : Math.min(best, bottom), 0);
            const segmentEnd = finalBottom <= maxBoundary + 0.001
              ? finalBottom
              : safeBoundary > segmentStart + 0.001 ? safeBoundary
              : nextLineBottom > segmentStart ? nextLineBottom : maxBoundary;
            const delta = content.y - segmentStart;
            const fragment = clipTree(complete, segmentStart, segmentEnd, delta);
            if (fragment) fragmentChildren.push(fragment);
            const consumed = Math.max(0.001, segmentEnd - segmentStart);
            cursorY = content.y + consumed;
            segmentStart = segmentEnd;
            remainingHeight = content.height;
            if (segmentStart < finalBottom - 0.001) {
              flushList();
              nextPage();
              fragmentStartY = cursorY;
            }
            if (segmentEnd > maxBoundary + 0.001) {
              diagnostics.push({ code: "OVERSIZED_BLOCK", message: "Uma linha dentro de uma lista aninhada excede a área útil da página; a linha foi mantida íntegra.", blockId: item.id });
            }
          }
          cursorY += 2;
          lastSpacing = 2;
          continue;
        }
        if (itemHeight > content.height && item.children.every(child => child.type === "paragraph")) {
          // Oversized plain-text list items can span pages. Preserve the list
          // item structure on each page and show the marker only on its first part.
          if (cursorY > content.y) {
            flushList();
            nextPage();
            fragmentStartY = cursorY;
          }
          let itemStartY = cursorY;
          let itemChildren: LayoutBlock[] = [];
          let firstItemFragment = true;
          const finishItemFragment = () => {
            if (!itemChildren.length) return;
            fragmentChildren.push({
              blockId: item.id, type: "listItem", pageIndex: page.index,
              rect: { x: content.x, y: itemStartY, width: content.width, height: Math.max(12, cursorY - itemStartY) },
              lines: [], children: itemChildren, marker: firstItemFragment ? marker : undefined, depth: 0
            });
            itemChildren = [];
            firstItemFragment = false;
          };
          for (const paragraph of item.children) {
            if (paragraph.type !== "paragraph") continue;
            const x = content.x + 18;
            const availableWidth = Math.max(1, content.width - 18);
            const measured = blockTextLayout(paragraph, x, cursorY, availableWidth, options);
            let lineOffset = 0;
            let firstParagraphFragment = true;
            while (lineOffset < measured.lines.length) {
              const topInset = firstParagraphFragment ? safeNumber(paragraph.padding, 0) + safeNumber(paragraph.borderWidth, 0) : 0;
              let available = content.y + content.height - cursorY - topInset;
              if (available < measured.lines[lineOffset].height && cursorY > content.y) {
                finishItemFragment();
                flushList();
                nextPage();
                fragmentStartY = cursorY;
                itemStartY = cursorY;
                available = content.y + content.height - cursorY - topInset;
              }
              let count = 0;
              let lineHeightSum = 0;
              while (lineOffset + count < measured.lines.length) {
                const nextHeight = measured.lines[lineOffset + count].height;
                if (count > 0 && lineHeightSum + nextHeight > available + 0.001) break;
                if (count === 0 && nextHeight > available && cursorY > content.y) break;
                lineHeightSum += nextHeight;
                count += 1;
              }
              if (count === 0) {
                finishItemFragment();
                flushList();
                nextPage();
                fragmentStartY = cursorY;
                itemStartY = cursorY;
                available = content.height;
                count = 1;
                lineHeightSum = measured.lines[lineOffset].height;
                diagnostics.push({ code: "OVERSIZED_BLOCK", message: "Uma linha de texto de item de lista excede a área útil da página.", blockId: item.id });
              }
              const isLastFragment = lineOffset + count >= measured.lines.length;
              const bottomInset = isLastFragment ? safeNumber(paragraph.padding, 0) + safeNumber(paragraph.borderWidth, 0) : 0;
              const fragmentHeight = topInset + lineHeightSum + bottomInset;
              const firstLineY = measured.lines[lineOffset].y;
              const lines = measured.lines.slice(lineOffset, lineOffset + count).map(line => ({
                ...line, y: cursorY + topInset + (line.y - firstLineY)
              }));
              itemChildren.push({
                blockId: paragraph.id, type: "paragraph", pageIndex: page.index,
                rect: { x, y: cursorY, width: availableWidth, height: fragmentHeight }, lines,
                style: styleForParagraph(paragraph)
              });
              cursorY += fragmentHeight;
              lineOffset += count;
              firstParagraphFragment = false;
              if (lineOffset < measured.lines.length) {
                finishItemFragment();
                flushList();
                nextPage();
                fragmentStartY = cursorY;
                itemStartY = cursorY;
              }
            }
            const paragraphSpacing = safeNumber(paragraph.spacingAfter, 6);
            cursorY += Math.min(paragraphSpacing, Math.max(0, content.y + content.height - cursorY));
          }
          finishItemFragment();
          cursorY += 2;
          lastSpacing = 2;
          continue;
        }
        if (itemHeight > content.height) diagnostics.push({ code: "OVERSIZED_BLOCK",
          message: "Item de lista com listas aninhadas maior que a área útil da página; a estrutura é preservada, mas a divisão automática ainda não é suportada.", blockId: item.id });
        const laidOut = buildListItem(item, marker, 0, cursorY);
        fragmentChildren.push(laidOut.block);
        cursorY += laidOut.height + 2;
        lastSpacing = 2;
      }
      flushList();
      cursorY += 4;
      return;
    }
    if (block.type === "paragraph" || block.type === "heading") {
      const spacingBefore = safeNumber(block.spacingBefore, block.type === "heading" ? 8 : 0);
      const spacingAfter = safeNumber(block.spacingAfter, block.type === "heading" ? 5 : 6);
      let measured = blockTextLayout(block, content.x, 0, content.width, options);
      const lineHeight = measured.lines[0]?.height || safeNumber(options.fontSize, DEFAULT_FONT) * 1.2;
      const totalHeight = measured.height;
      if (measured.lines.some(line => line.height > content.height)) diagnostics.push({ code: "OVERSIZED_BLOCK", message: "Linha de texto maior que a área útil da página; mantida íntegra para evitar perda de conteúdo.", blockId: block.id });
      const remaining = content.y + content.height - cursorY;
      let headingKeepHeight = 0;
      if (options.keepHeadingsWithNext && block.type === "heading") {
        const following = document.content[blockIndex + 1];
        if (following) {
          if (following.type === "paragraph" || following.type === "heading") {
            const followingLayout = blockTextLayout(following, content.x, 0, content.width, options);
            headingKeepHeight = followingLayout.lines[0]?.height || safeNumber(options.fontSize, DEFAULT_FONT) * 1.2;
          } else if (following.type === "table") {
            headingKeepHeight = 24;
          } else if (following.type === "image") {
            const resource = document.resources.find(item => item.id === following.resourceId);
            const naturalWidth = safeNumber(following.width, Math.min(content.width, 240));
            headingKeepHeight = Math.min(safeNumber(following.height, resource ? naturalWidth * 0.75 : 24), content.height);
          } else {
            headingKeepHeight = safeNumber(options.fontSize, DEFAULT_FONT) * 1.25;
          }
        }
      }
      const mustKeepHeadingWithNext = options.keepHeadingsWithNext && block.type === "heading"
        && headingKeepHeight > 0 && totalHeight + spacingBefore + spacingAfter + headingKeepHeight > remaining;
      const mustKeepParagraph = options.keepParagraphsTogether && totalHeight <= content.height
        && totalHeight + spacingBefore + spacingAfter > remaining;
      if (cursorY > content.y && (mustKeepHeadingWithNext || mustKeepParagraph)) nextPage();
      cursorY += spacingBefore;
      measured = blockTextLayout(block, content.x, cursorY, content.width, options);
      let lineOffset = 0;
      let firstFragment = true;
      while (lineOffset < measured.lines.length) {
        const topInset = firstFragment ? safeNumber(block.padding, 0) + safeNumber(block.borderWidth, 0) : 0;
        let available = content.y + content.height - cursorY - topInset;
        if (available < measured.lines[lineOffset].height && cursorY > content.y) {
          nextPage();
          available = content.y + content.height - cursorY - topInset;
        }
        const firstLineY = measured.lines[lineOffset].y;
        let count = 0;
        let lineHeightSum = 0;
        while (lineOffset + count < measured.lines.length) {
          const nextHeight = measured.lines[lineOffset + count].height;
          if (count > 0 && lineHeightSum + nextHeight > available + 0.001) break;
          if (count === 0 && nextHeight > available && cursorY > content.y) break;
          lineHeightSum += nextHeight;
          count += 1;
        }
        if (count === 0) {
          nextPage();
          continue;
        }
        const isLastFragment = lineOffset + count >= measured.lines.length;
        const bottomInset = isLastFragment ? safeNumber(block.padding, 0) + safeNumber(block.borderWidth, 0) : 0;
        const fragmentHeight = topInset + lineHeightSum + bottomInset;
        const fragmentLines = measured.lines.slice(lineOffset, lineOffset + count).map(line => ({ ...line, y: cursorY + topInset + (line.y - firstLineY) }));
        addBlock(block, { x: content.x, y: cursorY, width: content.width, height: fragmentHeight }, fragmentLines, { continued: !firstFragment });
        cursorY += fragmentHeight;
        lineOffset += count;
        firstFragment = false;
        if (lineOffset < measured.lines.length) nextPage();
      }
      if (measured.lines.length === 0) cursorY += lineHeight;
      cursorY += spacingAfter;
      return;
    }
    const text = plainBlockText(block);
    const measured = wrapText(text, content.width - 20, safeNumber(options.fontSize, DEFAULT_FONT), options.fontFamily || "Arial", options.metrics);
    const lineHeight = safeNumber(options.fontSize, DEFAULT_FONT) * 1.25;
    const blockHeight = Math.max(lineHeight, measured.length * lineHeight) + 8;
    if (cursorY > content.y && cursorY + blockHeight > content.y + content.height) nextPage();
    const lines = measured.map((line,index)=>({text:line.text,x:content.x+20+(/^│ /.test(line.text)?8:(/^(?:↳ )+/.exec(line.text)?.[0].length||0)*4),y:cursorY+index*lineHeight,width:line.width,height:lineHeight,startOffset:line.start,endOffset:line.end,align:"start" as const}));
    addBlock(block, { x: content.x, y: cursorY, width: content.width, height: blockHeight }, lines);
    cursorY += blockHeight + 6;
  });
  // Empty documents still have one physical page.
  return { pages, pageCount: pages.length, diagnostics };
}

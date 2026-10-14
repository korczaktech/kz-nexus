/**
 * Native deterministic layout engine for Korczak Nexus.
 *
 * Geometry is measured in points. Text metrics are injected by the host so a
 * browser, desktop or mobile host can use its actual font renderer. The
 * fallback measurer is deterministic and intentionally approximate.
 */
import type { Alignment, Block, Heading, NexusDocument, PageConfig, Paragraph, TextRun } from "../model/types";

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
      total += options.metrics ? options.metrics.measureText(chunk, style.fontSize, style.fontFamily) : defaultMeasure(chunk, style.fontSize);
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
      if (h > content.height) diagnostics.push({ code: "OVERSIZED_BLOCK", message: "Imagem maior que a área útil da página; reduzida apenas à largura disponível.", blockId: block.id });
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
        if (cursorY > content.y && cursorY + row.height > content.y + content.height) {
          flushTableFragment(); nextPage(); fragmentStartY = cursorY;
        }
        // An individual row taller than a page is kept intact and reported. Hosts
        // can inspect its line metrics and choose a more advanced cell-splitting UI.
        if (row.height > content.height) diagnostics.push({ code: "OVERSIZED_BLOCK", message: "Linha de tabela maior que a área útil da página; mantida íntegra para não corromper células.", blockId: block.id });
        const rowY = cursorY;
        const cells = row.cells.map(cell => {
          let cellY = rowY + 4;
          const lines: LayoutLine[] = [];
          for (const paragraph of cell.paragraphs) {
            lines.push(...paragraph.lines.map(line => ({ ...line, x: cell.x + 4 + (line.x - (content.x + (row.cells.indexOf(cell)) * colWidth + 4)), y: cellY + (line.y - 0) })));
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
        let available = content.y + content.height - cursorY;
        if (available < measured.lines[lineOffset].height && cursorY > content.y) {
          nextPage();
          available = content.y + content.height - cursorY;
        }
        const firstLineY = measured.lines[lineOffset].y;
        let count = 0;
        let fragmentHeight = 0;
        while (lineOffset + count < measured.lines.length) {
          const nextHeight = measured.lines[lineOffset + count].height;
          if (count > 0 && fragmentHeight + nextHeight > available + 0.001) break;
          if (count === 0 && nextHeight > available && cursorY > content.y) break;
          fragmentHeight += nextHeight;
          count += 1;
        }
        if (count === 0) {
          nextPage();
          continue;
        }
        const fragmentLines = measured.lines.slice(lineOffset, lineOffset + count).map(line => ({ ...line, y: cursorY + (line.y - firstLineY) }));
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

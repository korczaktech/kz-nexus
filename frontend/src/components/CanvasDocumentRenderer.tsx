import { useEffect, useRef } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { getLineXAtOffset, getSelectionGeometry, hitTestLayout, type LayoutBlock, type LayoutLine, type LayoutPage, type LayoutResult, type Mark, type NexusDocument, type Selection, type SmartCanvasHitTarget, type LayoutTextRun } from "../../../packages/engine/src/index";

const PT_TO_CSS_PX = 96 / 72;
const PAGE_GAP = 24;
const PAGE_SHADOW = "0 4px 22px #10182824";
const DEFAULT_TEXT = "#111111";

type CanvasPageProps = {
  page: LayoutPage;
  pageCount: number;
  document: NexusDocument;
  headerText: string;
  footerText: string;
  showPageNumbers: boolean;
  layout: LayoutResult;
  onHitTest?: (target: SmartCanvasHitTarget) => void;
  selection?: Selection;
  showCaret?: boolean;
  activeCellId?: string;
  activeCellSelection?: { cellId: string; text: string; anchorOffset: number; offset: number };
};

function markedFont(marks: Mark[], fontSize: number, fontFamily: string): string {
  const weight = marks.some(mark => mark.type === "bold") ? "700" : "400";
  const italic = marks.some(mark => mark.type === "italic") ? "italic " : "";
  const fontSizeMark = marks.find((mark): mark is Extract<Mark, { type: "fontSize" }> => mark.type === "fontSize");
  const isScript = marks.some(mark => mark.type === "superscript" || mark.type === "subscript");
  const size = isScript ? fontSize * 0.75 : fontSizeMark ? fontSizeMark.value * 0.75 : fontSize;
  const family = marks.find(mark => mark.type === "fontFamily");
  return `${italic}${weight} ${size * PT_TO_CSS_PX}px ${family?.type === "fontFamily" ? family.value : fontFamily}`;
}

function markColor(marks: Mark[]): string {
  const color = marks.find(mark => mark.type === "color");
  return color?.type === "color" ? color.value : DEFAULT_TEXT;
}

function drawLine(ctx: CanvasRenderingContext2D, line: LayoutLine): void {
  const runs = line.runs?.length ? line.runs : [{
    text: line.text, fontSize: 11, fontFamily: "Arial", marks: [] as Mark[], width: line.width,
  }];
  // Measure each run once; alignment and drawing share the same measurements.
  const widths = runs.map(run => {
    ctx.font = markedFont(run.marks, run.fontSize, run.fontFamily);
    return ctx.measureText(run.text).width;
  });
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  const availableWidth = Math.max(0, line.width * PT_TO_CSS_PX);
  let x = line.x * PT_TO_CSS_PX;
  if (line.align === "center") x += Math.max(0, (availableWidth - totalWidth) / 2);
  else if (line.align === "end") x += Math.max(0, availableWidth - totalWidth);
  const top = line.y * PT_TO_CSS_PX;
  const baseline = top + Math.min(line.height * PT_TO_CSS_PX * 0.82, line.height * PT_TO_CSS_PX - 1);
  for (let index = 0; index < runs.length; index += 1) {
    const run = runs[index];
    const width = widths[index];
    ctx.font = markedFont(run.marks, run.fontSize, run.fontFamily);
    ctx.textBaseline = "alphabetic";
    const highlight = run.marks.find(mark => mark.type === "highlight");
    const comment = run.marks.find(mark => mark.type === "comment");
    if (highlight?.type === "highlight") {
      ctx.fillStyle = highlight.value;
      ctx.fillRect(x, top + 1, width, Math.max(1, line.height * PT_TO_CSS_PX - 2));
    } else if (comment) {
      ctx.fillStyle = "#fef3c7";
      ctx.fillRect(x, top + 1, width, Math.max(1, line.height * PT_TO_CSS_PX - 2));
    }
    ctx.fillStyle = markColor(run.marks);
    ctx.fillText(run.text, x, baseline);
    const underline = run.marks.some(mark => mark.type === "underline" || mark.type === "link");
    const strike = run.marks.some(mark => mark.type === "strike");
    if (underline || strike || comment) {
      ctx.strokeStyle = comment ? "#d97706" : markColor(run.marks);
      ctx.lineWidth = comment ? 1 : Math.max(0.6, run.fontSize * PT_TO_CSS_PX / 16);
      ctx.setLineDash(comment ? [1.5, 1.5] : []);
      ctx.beginPath();
      const y = strike ? baseline - run.fontSize * PT_TO_CSS_PX * 0.32 : baseline + 1.5;
      ctx.moveTo(x, y);
      ctx.lineTo(x + width, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    x += width;
  }
}

function findTopLevelBlock(document: NexusDocument, id: string) {
  return document.content.find(block => block.id === id);
}

function drawBlock(ctx: CanvasRenderingContext2D, block: LayoutBlock, document: NexusDocument, imageCache: Map<string, HTMLImageElement>): void {
  const x = block.rect.x * PT_TO_CSS_PX;
  const y = block.rect.y * PT_TO_CSS_PX;
  const width = block.rect.width * PT_TO_CSS_PX;
  const height = block.rect.height * PT_TO_CSS_PX;

  if (block.style?.backgroundColor) {
    ctx.fillStyle = block.style.backgroundColor;
    ctx.fillRect(x, y, width, height);
  }
  if (block.style?.borderColor && block.style.borderWidth) {
    ctx.strokeStyle = block.style.borderColor;
    ctx.lineWidth = block.style.borderWidth * PT_TO_CSS_PX;
    ctx.strokeRect(x, y, width, height);
  }
  if (block.quote) {
    ctx.strokeStyle = "#98a2b3";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + 4 * PT_TO_CSS_PX, y);
    ctx.lineTo(x + 4 * PT_TO_CSS_PX, y + height);
    ctx.stroke();
  }
  if (block.type === "listItem" && block.marker) {
    ctx.font = `10pt Arial, sans-serif`;
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#344054";
    ctx.fillText(block.marker, x, y + 2 * PT_TO_CSS_PX);
    ctx.textAlign = "left";
  }
  if (block.type === "thematicBreak") {
    ctx.strokeStyle = "#98a2b3";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y);
    ctx.stroke();
  }
  if (block.table) {
    for (const row of block.table.rows) {
      for (const cell of row.cells) {
        const cellX = cell.rect.x * PT_TO_CSS_PX;
        const cellY = cell.rect.y * PT_TO_CSS_PX;
        const cellWidth = cell.rect.width * PT_TO_CSS_PX;
        const cellHeight = cell.rect.height * PT_TO_CSS_PX;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(cellX, cellY, cellWidth, cellHeight);
        ctx.strokeStyle = "#98a2b3";
        ctx.lineWidth = 1;
        ctx.strokeRect(cellX, cellY, cellWidth, cellHeight);
        for (const line of cell.lines) drawLine(ctx, line);
      }
    }
  }
  for (const line of block.lines) drawLine(ctx, line);

  if (block.type === "image") {
    const model = findTopLevelBlock(document, block.blockId);
    if (model?.type === "image") {
      const resource = document.resources.find(item => item.id === model.resourceId);
      const image = imageCache.get(model.resourceId);
      if (image?.complete && image.naturalWidth > 0) {
        ctx.drawImage(image, x, y, width, height);
      } else {
        ctx.fillStyle = "#f2f4f7";
        ctx.fillRect(x, y, width, height);
        ctx.strokeStyle = "#d0d5dd";
        ctx.strokeRect(x, y, width, height);
        ctx.fillStyle = "#667085";
        ctx.font = `10pt Arial, sans-serif`;
        ctx.textBaseline = "top";
        ctx.fillText(model.alt || (resource ? "Carregando imagem…" : "Imagem indisponível"), x + 6, y + 6, Math.max(0, width - 12));
      }
    }
  }

  for (const child of block.children ?? []) drawBlock(ctx, child, document, imageCache);
}

function pageText(page: LayoutPage): string {
  const parts: string[] = [];
  const visit = (block: LayoutBlock) => {
    if (block.marker) parts.push(block.marker);
    for (const line of block.lines) parts.push(line.text);
    for (const row of block.table?.rows ?? []) for (const cell of row.cells) for (const line of cell.lines) parts.push(line.text);
    for (const child of block.children ?? []) visit(child);
  };
  page.blocks.forEach(visit);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function CanvasPage({ page, pageCount, document, headerText, footerText, showPageNumbers, layout, onHitTest, selection, showCaret = false, activeCellId, activeCellSelection }: CanvasPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const cssWidth = page.width * PT_TO_CSS_PX;
  const cssHeight = page.height * PT_TO_CSS_PX;
  const style: CSSProperties = {
    display: "block",
    flex: "0 0 auto",
    width: cssWidth,
    height: cssHeight,
    background: "#ffffff",
    boxShadow: PAGE_SHADOW,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const ratio = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, cssWidth, cssHeight);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, cssWidth, cssHeight);

    const imageCache = new Map<string, HTMLImageElement>();
    let cancelled = false;
    // Load only image resources referenced by blocks on this page.
    const pageImageIds = new Set<string>();
    const collectImageIds = (blocks: LayoutBlock[]) => {
      for (const block of blocks) {
        if (block.type === "image") {
          const model = findTopLevelBlock(document, block.blockId);
          if (model?.type === "image") pageImageIds.add(model.resourceId);
        }
        if (block.children?.length) collectImageIds(block.children);
      }
    };
    collectImageIds(page.blocks);
    const imageResources = document.resources.filter(
      resource => resource.kind === "image" && pageImageIds.has(resource.id),
    );
    for (const resource of imageResources) {
      const image = new Image();
      imageCache.set(resource.id, image);
      image.onload = () => {
        if (!cancelled) paint();
      };
      image.onerror = () => {
        if (!cancelled) paint();
      };
      image.src = `data:${resource.mimeType};base64,${resource.data}`;
    }

    const paint = () => {
      if (cancelled) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, cssWidth, cssHeight);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, cssWidth, cssHeight);
      if (headerText) {
        context.font = `9pt Arial, sans-serif`;
        context.fillStyle = "#667085";
        context.textBaseline = "top";
        context.fillText(headerText, page.content.x * PT_TO_CSS_PX, 12 * PT_TO_CSS_PX, page.content.width * PT_TO_CSS_PX);
      }
      for (const block of page.blocks) drawBlock(context, block, document, imageCache);
      if (footerText || showPageNumbers) {
        context.font = `9pt Arial, sans-serif`;
        context.fillStyle = "#667085";
        context.textBaseline = "alphabetic";
        const footerY = cssHeight - 12 * PT_TO_CSS_PX;
        if (footerText) context.fillText(footerText, page.content.x * PT_TO_CSS_PX, footerY, page.content.width * PT_TO_CSS_PX);
        if (showPageNumbers) {
          const label = `Página ${page.index + 1} de ${pageCount}`;
          context.textAlign = "right";
          context.fillText(label, (page.width - page.content.x) * PT_TO_CSS_PX, footerY);
          context.textAlign = "left";
        }
      }
    };
    paint();
    return () => { cancelled = true; };
  }, [page, pageCount, document, headerText, footerText, showPageNumbers, cssWidth, cssHeight]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const context = overlay.getContext("2d");
    if (!context) return;
    const ratio = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    overlay.width = Math.round(cssWidth * ratio);
    overlay.height = Math.round(cssHeight * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, cssWidth, cssHeight);
    if (activeCellId) {
      context.strokeStyle = "#2563eb";
      context.lineWidth = 2;
      context.setLineDash([]);
      for (const block of page.blocks) {
        for (const row of block.table?.rows ?? []) {
          for (const cell of row.cells) {
            if (cell.cellId !== activeCellId) continue;
            context.strokeRect(
              cell.rect.x * PT_TO_CSS_PX + 1,
              cell.rect.y * PT_TO_CSS_PX + 1,
              Math.max(0, cell.rect.width * PT_TO_CSS_PX - 2),
              Math.max(0, cell.rect.height * PT_TO_CSS_PX - 2),
            );
            if (!activeCellSelection || activeCellSelection.cellId !== cell.cellId) continue;
            const measure = (value: string, run?: LayoutTextRun) => {
              if (run) context.font = markedFont(run.marks, run.fontSize, run.fontFamily);
              return context.measureText(value).width * 72 / 96;
            };
            const start = Math.min(activeCellSelection.anchorOffset, activeCellSelection.offset);
            const end = Math.max(activeCellSelection.anchorOffset, activeCellSelection.offset);
            let baseOffset = 0;
            let previousLocalStart = -1;
            let previousGlobalEnd = 0;
            let caretDrawn = false;
            for (let lineIndex = 0; lineIndex < cell.lines.length; lineIndex += 1) {
              const line = cell.lines[lineIndex];
              // Each paragraph in a cell has its own local offsets. Detect the
              // reset at a paragraph boundary, including consecutive empty paragraphs.
              if (lineIndex > 0 && (line.startOffset < previousLocalStart ||
                (line.startOffset === 0 && previousLocalStart === 0))) {
                baseOffset = previousGlobalEnd + 1;
              }
              const globalStart = baseOffset + line.startOffset;
              const globalEnd = baseOffset + line.endOffset;
              const selectedStart = Math.max(start, globalStart);
              const selectedEnd = Math.min(end, globalEnd);
              if (selectedEnd > selectedStart) {
                const left = getLineXAtOffset(line, selectedStart - baseOffset, measure);
                const right = getLineXAtOffset(line, selectedEnd - baseOffset, measure);
                context.fillStyle = "rgba(59, 130, 246, 0.28)";
                context.fillRect(left * PT_TO_CSS_PX, line.y * PT_TO_CSS_PX, Math.max(1, (right - left) * PT_TO_CSS_PX), line.height * PT_TO_CSS_PX);
              }
              if (!caretDrawn && start === end && start >= globalStart && start <= globalEnd) {
                const x = getLineXAtOffset(line, start - baseOffset, measure);
                context.strokeStyle = "#2563eb";
                context.lineWidth = 1.25;
                context.beginPath();
                context.moveTo(x * PT_TO_CSS_PX, line.y * PT_TO_CSS_PX);
                context.lineTo(x * PT_TO_CSS_PX, (line.y + line.height) * PT_TO_CSS_PX);
                context.stroke();
                caretDrawn = true;
              }
              previousLocalStart = line.startOffset;
              previousGlobalEnd = globalEnd;
            }
          }
        }
      }
    }
    if (!selection) return;

    const measureText = (text: string, run?: LayoutTextRun) => {
      if (run) context.font = markedFont(run.marks, run.fontSize, run.fontFamily);
      return context.measureText(text).width * 72 / 96;
    };
    const geometry = getSelectionGeometry(layout, page.index, selection, measureText);
    context.fillStyle = "rgba(59, 130, 246, 0.24)";
    for (const rect of geometry.selectionRects) {
      context.fillRect(rect.x * PT_TO_CSS_PX, rect.y * PT_TO_CSS_PX, rect.width * PT_TO_CSS_PX, rect.height * PT_TO_CSS_PX);
    }
    if (showCaret && geometry.caret) {
      context.strokeStyle = "#2563eb";
      context.lineWidth = 1.25;
      context.beginPath();
      context.moveTo(geometry.caret.x * PT_TO_CSS_PX, geometry.caret.y * PT_TO_CSS_PX);
      context.lineTo(geometry.caret.x * PT_TO_CSS_PX, (geometry.caret.y + geometry.caret.height) * PT_TO_CSS_PX);
      context.stroke();
    }
  }, [layout, page.index, selection, showCaret, activeCellId, activeCellSelection, cssWidth, cssHeight]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!onHitTest) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const x = ((event.clientX - bounds.left) / bounds.width) * page.width;
    const y = ((event.clientY - bounds.top) / bounds.height) * page.height;
    const context = canvasRef.current?.getContext("2d");
    const measureText = context ? (text: string, run?: LayoutTextRun) => {
      if (run) context.font = markedFont(run.marks, run.fontSize, run.fontFamily);
      return context.measureText(text).width * 72 / 96;
    } : undefined;
    const target = hitTestLayout(layout, page.index, x, y, { measureText });
    if (target) onHitTest(target);
  };

  return <div style={{ position: "relative", flex: "0 0 auto", width: cssWidth, height: cssHeight }}>
    <canvas
      ref={canvasRef}
      onPointerDown={onHitTest ? handlePointerDown : undefined}
      tabIndex={onHitTest ? 0 : undefined}
      className="kortex-canvas-page"
      role="img"
      aria-label={`Página ${page.index + 1} de ${pageCount}. ${pageText(page)}`}
      data-page-index={page.index}
      style={style}
    />
    <canvas
      ref={overlayRef}
      aria-hidden="true"
      className="kortex-canvas-interaction-overlay"
      style={{ position: "absolute", inset: 0, width: cssWidth, height: cssHeight, pointerEvents: "none" }}
    />
  </div>;
}

export function CanvasDocumentRenderer({ layout, document, headerText = "", footerText = "", showPageNumbers = false, onHitTest, selection, showCaret = false, activeCellId, activeCellSelection }: {
  layout: LayoutResult;
  document: NexusDocument;
  headerText?: string;
  footerText?: string;
  showPageNumbers?: boolean;
  onHitTest?: (target: SmartCanvasHitTarget) => void;
  selection?: Selection;
  showCaret?: boolean;
  activeCellId?: string;
  activeCellSelection?: { cellId: string; text: string; anchorOffset: number; offset: number };
}) {
  return <div className="kortex-canvas-pages" data-renderer="canvas-2d" style={{
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: PAGE_GAP,
    padding: "24px 16px 48px",
    minWidth: 0,
  }}>
    {layout.pages.map(page => <CanvasPage
      key={page.index}
      page={page}
      layout={layout}
      onHitTest={onHitTest}
      selection={selection}
      showCaret={showCaret}
      activeCellId={activeCellId}
      activeCellSelection={activeCellSelection}
      pageCount={layout.pageCount}
      document={document}
      headerText={headerText}
      footerText={footerText}
      showPageNumbers={showPageNumbers}
    />)}
  </div>;
}

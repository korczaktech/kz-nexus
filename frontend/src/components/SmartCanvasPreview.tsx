import { useEffect, useMemo, useRef, useState } from "react";
import { addTableColumn, addTableRow, collapsedAt, convertBlockToBlockquote, convertBlockToList, deleteBlock, deleteText, insertImportedBlocksAtSelection, insertImageResource, insertPageBreak, insertTable as insertTableCommand, insertTableCellImageResource, insertText, insertThematicBreak, moveBlock, removeImage, updateEditorObject, updateImage, getLineXAtOffset, getOffsetAtLineX, getPlainText, layoutDocument, mergeBlockWithPrevious, replaceRange, removeTableColumn, removeTableRow, setAlign, setCellText, setHeadingLevel, setIndent, setParagraphStyle, splitBlock, toggleMark as toggleMarkCommand, type Editor as NexusEngineSession, type Mark, type NexusDocument, type Selection, type SmartCanvasHitTarget } from "../../../packages/engine/src/index";
import { CanvasDocumentRenderer } from "./CanvasDocumentRenderer";
import { nexusDocumentFromHtml } from "../services/nexusEngineAdapter";
import { lineEndOffset, lineStartOffset, nearestGraphemeOffset, nextCodePointOffset, nextWordOffset, previousCodePointOffset, previousWordOffset, verticalLineOffset, wordRangeAt } from "./smartCanvasTextOffsets";
import { collectSmartCanvasTextBlocks, getSmartCanvasTextSelectionRanges } from "./editorSmartCanvas";

type TextBlock = { id: string; text: string };

function collectTextBlocks(nodes: readonly unknown[]): TextBlock[] {
  const blocks: TextBlock[] = [];
  for (const value of nodes) {
    if (!value || typeof value !== "object") continue;
    const node = value as { id?: unknown; type?: unknown; children?: unknown };
    if (typeof node.id === "string" && (node.type === "paragraph" || node.type === "heading")) {
      blocks.push({ id: node.id, text: getPlainText(value as Extract<NexusDocument["content"][number], { type: "paragraph" | "heading" }>) });
    }
    // Table-cell paragraphs are edited through the dedicated cell controller.
    // Treating them as top-level text blocks makes Ctrl+A, arrow navigation and
    // cross-block deletion target nested IDs that the paragraph commands may not support.
    if (node.type !== "table" && Array.isArray(node.children)) {
      blocks.push(...collectTextBlocks(node.children));
    }
  }
  return blocks;
}

type PastedCellImage = { resourceId: string; alt: string; width?: number; height?: number };

type PastedCellTextRun = { text: string; marks: Mark[] };
type PastedCellTextLine = PastedCellTextRun[];

function flattenPastedCellContent(nodes: readonly unknown[], images: PastedCellImage[]): PastedCellTextLine[] {
  const plainRun = (text: string): PastedCellTextRun => ({ text, marks: [] });
  const joinLines = (lines: PastedCellTextLine[], separator: string): PastedCellTextLine =>
    lines.flatMap((line, index) => index === 0 ? line : [plainRun(separator), ...line]);
  const flattenNode = (value: unknown): PastedCellTextLine[] => {
    if (!value || typeof value !== "object") return [];
    const node = value as { type?: string; id?: string; alt?: string; resourceId?: string; width?: number; height?: number; start?: number; children?: unknown[]; images?: unknown[] };
    if (node.type === "paragraph" || node.type === "heading") {
      const block = value as Extract<NexusDocument["content"][number], { type: "paragraph" | "heading" }>;
      return [block.children.map(run => ({ text: run.text, marks: run.marks.map(mark => ({ ...mark })) }))];
    }
    if (node.type === "image" && typeof node.resourceId === "string") {
      images.push({ resourceId: node.resourceId, alt: node.alt ?? "", width: node.width, height: node.height });
      return [];
    }
    if (node.type === "thematicBreak") return [[plainRun("")]];
    if (node.type === "blockquote") return (node.children ?? []).flatMap(flattenNode);
    if (node.type === "bulletList" || node.type === "orderedList") {
      return (node.children ?? []).flatMap((item, index) => {
        if (!item || typeof item !== "object") return [];
        const itemNode = item as { children?: unknown[] };
        const lines = (itemNode.children ?? []).flatMap(flattenNode);
        const marker = node.type === "orderedList" ? String((node.start ?? 1) + index) + ". " : "• ";
        return lines.length
          ? lines.map((line, lineIndex) => lineIndex === 0 ? [plainRun(marker), ...line] : [plainRun("  "), ...line])
          : [[plainRun(marker.trimEnd())]];
      });
    }
    if (node.type === "table") {
      return (node.children ?? []).map(rowValue => {
        if (!rowValue || typeof rowValue !== "object") return [plainRun("")];
        const row = rowValue as { children?: unknown[] };
        const cells = (row.children ?? []).map(cellValue => {
          if (!cellValue || typeof cellValue !== "object") return [plainRun("")];
          const cell = cellValue as { children?: unknown[]; images?: unknown[] };
          for (const image of cell.images ?? []) {
            if (!image || typeof image !== "object") continue;
            const item = image as { resourceId?: unknown; alt?: unknown; width?: unknown; height?: unknown };
            if (typeof item.resourceId === "string") images.push({
              resourceId: item.resourceId,
              alt: typeof item.alt === "string" ? item.alt : "",
              width: typeof item.width === "number" ? item.width : undefined,
              height: typeof item.height === "number" ? item.height : undefined,
            });
          }
          return joinLines((cell.children ?? []).flatMap(flattenNode), "\n");
        });
        return cells.flatMap((cell, index) => index === 0 ? cell : [plainRun(" | "), ...cell]);
      });
    }
    if (node.type === "listItem") return (node.children ?? []).flatMap(flattenNode);
    return (node.children ?? []).flatMap(flattenNode);
  };
  return nodes.flatMap(flattenNode);
}

type EditableCell = { tableId: string; rowId: string; cellId: string; text: string };
type CellParagraph = { id: string; text: string; start: number };

function collectCellParagraphs(nodes: readonly unknown[], tableId: string, rowId: string, cellId: string): CellParagraph[] {
  for (const value of nodes) {
    if (!value || typeof value !== "object") continue;
    const node = value as { id?: unknown; type?: unknown; children?: unknown };
    if (node.type === "table" && node.id === tableId && Array.isArray(node.children)) {
      for (const rowValue of node.children) {
        if (!rowValue || typeof rowValue !== "object") continue;
        const row = rowValue as { id?: unknown; children?: unknown };
        if (row.id !== rowId || !Array.isArray(row.children)) continue;
        for (const cellValue of row.children) {
          if (!cellValue || typeof cellValue !== "object") continue;
          const cell = cellValue as { id?: unknown; children?: unknown };
          if (cell.id !== cellId || !Array.isArray(cell.children)) continue;
          let start = 0;
          const paragraphs: CellParagraph[] = [];
          for (const child of cell.children as unknown[]) {
            if (!child || typeof child !== "object") continue;
            const block = child as { id?: unknown; type?: unknown; children?: unknown };
            if (typeof block.id !== "string" || (block.type !== "paragraph" && block.type !== "heading")) continue;
            const text = getPlainText(child as Extract<NexusDocument["content"][number], { type: "paragraph" | "heading" }>);
            paragraphs.push({ id: block.id, text, start });
            start += text.length + 1;
          }
          return paragraphs;
        }
      }
      return [];
    }
    if (Array.isArray(node.children)) {
      const nested = collectCellParagraphs(node.children, tableId, rowId, cellId);
      if (nested.length) return nested;
    }
  }
  return [];
}

function collectTableCells(nodes: readonly unknown[]): EditableCell[] {
  const cells: EditableCell[] = [];
  for (const value of nodes) {
    if (!value || typeof value !== "object") continue;
    const node = value as { id?: unknown; type?: unknown; children?: unknown };
    if (node.type === "table" && typeof node.id === "string" && Array.isArray(node.children)) {
      for (const rowValue of node.children) {
        if (!rowValue || typeof rowValue !== "object") continue;
        const row = rowValue as { id?: unknown; children?: unknown };
        if (typeof row.id !== "string" || !Array.isArray(row.children)) continue;
        for (const cellValue of row.children) {
          if (!cellValue || typeof cellValue !== "object") continue;
          const cell = cellValue as { id?: unknown; children?: unknown };
          if (typeof cell.id !== "string" || !Array.isArray(cell.children)) continue;
          const text = (cell.children as unknown[]).map(child => {
            if (!child || typeof child !== "object") return "";
            const block = child as { type?: unknown; children?: unknown };
            return block.type === "paragraph" || block.type === "heading"
              ? getPlainText(child as Extract<NexusDocument["content"][number], { type: "paragraph" | "heading" }>)
              : "";
          }).join("\n");
          cells.push({ tableId: node.id, rowId: row.id, cellId: cell.id, text });
        }
      }
    }
    if (Array.isArray(node.children)) cells.push(...collectTableCells(node.children));
  }
  return cells;
}

type DocumentNodeLike = { id?: string; type?: string; alt?: string; width?: number; height?: number; indent?: number; spacingAfter?: number; lineSpacing?: number; editorObject?: { kind: "note" | "textBox" | "shape"; label?: string; shape?: "rectangle" | "ellipse" | "triangle"; fill?: string; stroke?: string; width?: number; height?: number }; children?: unknown };

function findDocumentNode(nodes: readonly unknown[], id: string): DocumentNodeLike | undefined {
  for (const value of nodes) {
    if (!value || typeof value !== "object") continue;
    const node = value as DocumentNodeLike;
    if (node.id === id && typeof node.type === "string") return node;
    if (Array.isArray(node.children)) {
      const nested = findDocumentNode(node.children, id);
      if (nested) return nested;
    }
  }
  return undefined;
}

function marksAtCellOffset(
  nodes: readonly unknown[],
  cell: EditableCell,
  offset: number,
): Mark[] {
  const paragraphs = collectCellParagraphs(nodes, cell.tableId, cell.rowId, cell.cellId);
  const target = paragraphs.find(paragraph =>
    offset >= paragraph.start && offset <= paragraph.start + paragraph.text.length
  ) ?? paragraphs[paragraphs.length - 1];
  if (!target) return [];
  const findRuns = (items: readonly unknown[]): Array<{ text?: unknown; marks?: unknown }> | undefined => {
    for (const value of items) {
      if (!value || typeof value !== "object") continue;
      const node = value as { id?: unknown; children?: unknown };
      if (node.id === target.id && Array.isArray(node.children)) {
        return node.children as Array<{ text?: unknown; marks?: unknown }>;
      }
      if (Array.isArray(node.children)) {
        const nested = findRuns(node.children);
        if (nested) return nested;
      }
    }
    return undefined;
  };
  const runs = findRuns(nodes) ?? [];
  const localOffset = Math.max(0, Math.min(target.text.length, offset - target.start));
  let consumed = 0;
  let selected: Mark[] | undefined;
  for (const run of runs) {
    const text = typeof run.text === "string" ? run.text : "";
    const marks = Array.isArray(run.marks) ? run.marks as Mark[] : [];
    if (localOffset < consumed + text.length || (localOffset === consumed && text.length > 0)) {
      selected = marks;
      break;
    }
    if (localOffset === consumed + text.length && text.length > 0) selected = marks;
    consumed += text.length;
  }
  return (selected ?? []).map(mark => ({ ...mark }));
}

function findBlock(nodes: readonly unknown[], id: string): TextBlock | undefined {
  return collectTextBlocks(nodes).find(block => block.id === id);
}

function findTextNode(nodes: readonly unknown[], id: string): { text: string; runs: Array<{ text: string; marks: Mark[] }> } | undefined {
  for (const value of nodes) {
    if (!value || typeof value !== "object") continue;
    const node = value as { id?: unknown; type?: unknown; children?: unknown };
    if (node.id === id && (node.type === "paragraph" || node.type === "heading") && Array.isArray(node.children)) {
      const runs = node.children as Array<{ text?: unknown; marks?: unknown }>;
      const normalizedRuns = runs.map(run => ({
        text: typeof run.text === "string" ? run.text : "",
        marks: Array.isArray(run.marks) ? run.marks as Mark[] : [],
      }));
      return { text: normalizedRuns.map(run => run.text).join(""), runs: normalizedRuns };
    }
    if (node.type !== "table" && Array.isArray(node.children)) {
      const nested = findTextNode(node.children, id);
      if (nested) return nested;
    }
  }
  return undefined;
}

function marksAtTextOffset(nodes: readonly unknown[], blockId: string, offset: number, engine: NexusEngineSession): Mark[] {
  const node = findTextNode(nodes, blockId);
  if (!node) return [];
  let consumed = 0;
  let inherited: Mark[] = [];
  for (const run of node.runs) {
    if (offset <= consumed + run.text.length) { inherited = run.marks; break; }
    consumed += run.text.length;
    inherited = run.marks;
  }
  const stored = engine.getStoredMarkState();
  if (stored.blockId === blockId) {
    inherited = inherited.filter(mark => !stored.disabled.includes(mark.type));
    for (const mark of stored.active) inherited = [...inherited.filter(item => item.type !== mark.type), mark];
  }
  return inherited.map(mark => ({ ...mark }));
}

function findLayoutBlock(blocks: readonly import("../../../packages/engine/src/layout/layout").LayoutBlock[], id: string): import("../../../packages/engine/src/layout/layout").LayoutBlock | undefined {
  for (const block of blocks) {
    if (block.blockId === id) return block;
    const nested = findLayoutBlock(block.children ?? [], id);
    if (nested) return nested;
  }
  return undefined;
}

function collectLayoutLines(
  blocks: readonly import("../../../packages/engine/src/layout/layout").LayoutBlock[],
  blockId: string | null,
  result: Array<{ pageIndex: number; blockId: string; line: import("../../../packages/engine/src/layout/layout").LayoutLine }>,
  pageIndex: number,
): void {
  for (const block of blocks) {
    if (blockId === null || block.blockId === blockId) {
      for (const line of block.lines) result.push({ pageIndex, blockId: block.blockId, line });
    }
    collectLayoutLines(block.children ?? [], blockId, result, pageIndex);
  }
}

export function createCanvasLayoutMetrics(): import("../../../packages/engine/src/layout/layout").TextMetrics {
  let context: CanvasRenderingContext2D | null = null;
  try {
    context = window.document.createElement("canvas").getContext("2d");
  } catch {
    // Non-browser test hosts may not implement Canvas; the engine fallback remains deterministic.
  }
  return {
    measureText(text, fontSize, fontFamily, marks = []) {
      if (!context) return text.length * fontSize * 0.52;
      const bold = marks.some(mark => mark.type === "bold") ? "700 " : "400 ";
      const italic = marks.some(mark => mark.type === "italic") ? "italic " : "";
      context.font = `${italic}${bold}${fontSize * (96 / 72)}px ${fontFamily || "Arial"}`;
      return context.measureText(text).width * (72 / 96);
    },
    lineHeight(fontSize) {
      return fontSize * 1.2;
    },
  };
}

function createLayoutTextMeasurer(): (text: string, run?: import("../../../packages/engine/src/layout/layout").LayoutTextRun) => number {
  // Reuse one canvas/context for all measurements in a single navigation event.
  const canvas = window.document.createElement("canvas");
  const context = canvas.getContext("2d");
  return (text, run) => {
    const baseSize = run?.fontSize ?? 11;
    const sizeMark = run?.marks.find(mark => mark.type === "fontSize");
    const script = run?.marks.some(mark => mark.type === "superscript" || mark.type === "subscript");
    const size = script ? baseSize * 0.75 : sizeMark?.type === "fontSize" ? sizeMark.value * 0.75 : baseSize;
    if (!context) return text.length * size * 0.55;
    const bold = run?.marks.some(mark => mark.type === "bold") ? "700 " : "400 ";
    const italic = run?.marks.some(mark => mark.type === "italic") ? "italic " : "";
    const familyMark = run?.marks.find(mark => mark.type === "fontFamily");
    const family = familyMark?.type === "fontFamily" ? familyMark.value : run?.fontFamily ?? "Arial";
    context.font = `${italic}${bold}${size * (96 / 72)}px ${family}`;
    // Layout geometry is in points; Canvas text metrics are CSS pixels.
    return context.measureText(text).width * (72 / 96);
  };
}

async function readClipboardImage(file: File): Promise<{ mimeType: string; data: string }> {
  const supportedType = /^image\/(?:png|jpeg|gif|webp)$/i;
  if (!supportedType.test(file.type)) throw new Error("Formato de imagem não suportado.");
  if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
    throw new Error("A imagem deve ter entre 1 byte e 10 MB.");
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem da área de transferência."));
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result)
      : reject(new Error("A imagem da área de transferência está vazia."));
    reader.readAsDataURL(file);
  });
  const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl);
  if (!match) throw new Error("A imagem da área de transferência não pôde ser validada.");
  return { mimeType: match[1].toLowerCase(), data: match[2] };
}

function getSelectedText(nodes: readonly unknown[], selection: Selection): string {
  const blocks = collectSmartCanvasTextBlocks(nodes).map(block => ({ id: block.id, text: getPlainText(block) }));
  const anchorIndex = blocks.findIndex(block => block.id === selection.anchor.blockId);
  const focusIndex = blocks.findIndex(block => block.id === selection.focus.blockId);
  if (anchorIndex < 0 || focusIndex < 0) return "";
  if (anchorIndex === focusIndex) {
    return blocks[anchorIndex].text.slice(
      Math.min(selection.anchor.offset, selection.focus.offset),
      Math.max(selection.anchor.offset, selection.focus.offset),
    );
  }
  const forward = anchorIndex < focusIndex;
  const firstIndex = forward ? anchorIndex : focusIndex;
  const lastIndex = forward ? focusIndex : anchorIndex;
  const start = forward ? selection.anchor.offset : selection.focus.offset;
  const end = forward ? selection.focus.offset : selection.anchor.offset;
  return blocks.slice(firstIndex, lastIndex + 1).map((block, index, selected) => {
    if (index === 0) return block.text.slice(start);
    if (index === selected.length - 1) return block.text.slice(0, end);
    return block.text;
  }).join("\n");
}

export function SmartCanvasPreview({ document, engine, headerText = "", footerText = "", headerAlign = "left", footerAlign = "left", showPageNumbers = false, trackChangesActive = false, spellcheckEnabled = true, zoom = 100, showFormattingMarks = false, readOnly = false, onHeaderTextChange, onFooterTextChange, onHeaderAlignChange, onFooterAlignChange, onShowPageNumbersChange, onDocumentChange, onStatus, onSelectionChange, externalSelection }: {
  document: NexusDocument;
  engine: NexusEngineSession;
  headerText?: string;
  footerText?: string;
  headerAlign?: "left" | "center" | "right";
  footerAlign?: "left" | "center" | "right";
  showPageNumbers?: boolean;
  trackChangesActive?: boolean;
  spellcheckEnabled?: boolean;
  zoom?: number;
  showFormattingMarks?: boolean;
  readOnly?: boolean;
  onHeaderTextChange?: (value: string) => void;
  onFooterTextChange?: (value: string) => void;
  onHeaderAlignChange?: (value: "left" | "center" | "right") => void;
  onFooterAlignChange?: (value: "left" | "center" | "right") => void;
  onShowPageNumbersChange?: (value: boolean) => void;
  onDocumentChange: (document: NexusDocument) => void;
  onStatus?: (message: string) => void;
  onSelectionChange?: (selection: Selection | null) => void;
  externalSelection?: Selection | null;
}) {
  const [selection, setSelection] = useState<Selection | null>(engine.getSelection() ?? null);
  const selectionRef = useRef<Selection | null>(engine.getSelection() ?? null);
  const [activeCell, setActiveCell] = useState<(EditableCell & { anchorOffset: number; offset: number }) | null>(null);
  const [activeCellStoredMarks, setActiveCellStoredMarks] = useState<Mark[] | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [imageAltDraft, setImageAltDraft] = useState("");
  const [imageWidthDraft, setImageWidthDraft] = useState("");
  const [imageHeightDraft, setImageHeightDraft] = useState("");
  const [objectLabelDraft, setObjectLabelDraft] = useState("");
  const [objectWidthDraft, setObjectWidthDraft] = useState("");
  const [objectHeightDraft, setObjectHeightDraft] = useState("");
  const [objectFillDraft, setObjectFillDraft] = useState("#ffffff");
  const [objectStrokeDraft, setObjectStrokeDraft] = useState("#111827");
  const [fontSizeDraft, setFontSizeDraft] = useState("12");
  const [fontFamilyDraft, setFontFamilyDraft] = useState("Arial");
  const [textColorDraft, setTextColorDraft] = useState("#111827");
  const [highlightDraft, setHighlightDraft] = useState("#fff59d");
  const [linkDraft, setLinkDraft] = useState("");
  const [lineSpacingDraft, setLineSpacingDraft] = useState("1.2");
  const [spacingAfterDraft, setSpacingAfterDraft] = useState("8");
  const [headingLevelDraft, setHeadingLevelDraft] = useState("paragraph");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const lastCompositionValue = useRef<string | null>(null);
  const preferredVerticalX = useRef<number | null>(null);
  const preferredCellColumn = useRef<number | null>(null);
  useEffect(() => { onSelectionChange?.(selection); }, [selection, onSelectionChange]);
  useEffect(() => {
    if (externalSelection === undefined) return;
    selectionRef.current = externalSelection;
    setSelection(externalSelection);
  }, [externalSelection]);
  const layout = useMemo(() => {
    try { return layoutDocument(document, { metrics: createCanvasLayoutMetrics() }); }
    catch (error) {
      // Keep the preview resilient, but do not silently hide a broken canonical document/layout.
      console.error("[SmartCanvas] layoutDocument failed", error);
      return null;
    }
  }, [document]);

  // Give the engine a valid insertion point as soon as SmartCanvas mounts.
  // Keyboard input must not depend on a prior click on a text glyph.
  useEffect(() => {
    const current = engine.getSelection();
    if (current) {
      selectionRef.current = current;
      setSelection(current);
      return;
    }
    const first = collectTextBlocks(engine.getDocument().content)[0];
    if (!first) return;
    const initial = collapsedAt({ blockId: first.id, offset: 0 });
    selectionRef.current = initial;
    engine.setSelection(initial);
    setSelection(initial);
  }, [engine]);

  // Keep SmartCanvas interaction state synchronized when history actions are
  // triggered by the outer editor toolbar (not only by this component's keys).
  useEffect(() => {
    const unsubscribeSelection = engine.on("selectionChanged", ({ selection: next }) => {
      const changed = selectionRef.current !== (next ?? null);
      selectionRef.current = next ?? null;
      setSelection(next ?? null);
      if (!changed) return;
      // Cell editing has its own caret state and deliberately clears the
      // document-level selection. Do not let that clear the active cell.
      if (!next) return;
      setActiveCell(current => {
        const cells = collectTableCells(engine.getDocument().content);
        const owner = cells.find(cell => {
          const paragraphs = collectCellParagraphs(engine.getDocument().content, cell.tableId, cell.rowId, cell.cellId);
          return paragraphs.some(paragraph => paragraph.id === next.anchor.blockId) &&
            paragraphs.some(paragraph => paragraph.id === next.focus.blockId);
        });
        if (!owner) return current;
        const paragraphs = collectCellParagraphs(engine.getDocument().content, owner.tableId, owner.rowId, owner.cellId);
        const anchorParagraph = paragraphs.find(paragraph => paragraph.id === next.anchor.blockId);
        const focusParagraph = paragraphs.find(paragraph => paragraph.id === next.focus.blockId);
        if (!anchorParagraph || !focusParagraph) return current;
        return {
          ...owner,
          anchorOffset: Math.max(0, Math.min(owner.text.length, anchorParagraph.start + next.anchor.offset)),
          offset: Math.max(0, Math.min(owner.text.length, focusParagraph.start + next.focus.offset)),
        };
      });
    });
    const unsubscribeDocument = engine.on("documentChanged", ({ document: nextDocument }) => {
      setActiveCell(current => {
        if (!current) return null;
        const restored = collectTableCells(nextDocument.content).find(cell =>
          cell.tableId === current.tableId && cell.rowId === current.rowId && cell.cellId === current.cellId
        );
        if (!restored) return null;
        return {
          ...restored,
          anchorOffset: Math.min(current.anchorOffset, restored.text.length),
          offset: Math.min(current.offset, restored.text.length),
        };
      });
    });
    return () => {
      unsubscribeSelection();
      unsubscribeDocument();
    };
  }, [engine]);

  const syncSelection = (next: Selection | undefined) => {
    if (!next) return;
    setSelection(next);
    engine.setSelection(next);
  };
  const handleHit = (target: SmartCanvasHitTarget, clickCount = 1) => {
    preferredVerticalX.current = null;
    preferredCellColumn.current = null;
    if (target.kind === "text") {
      setActiveBlockId(null);
      const block = findBlock(engine.getDocument().content, target.blockId);
      const targetOffset = block ? nearestGraphemeOffset(block.text, target.position.offset) : target.position.offset;
      if (block && clickCount >= 2) {
        const range = clickCount >= 3
          ? { start: 0, end: block.text.length }
          : wordRangeAt(block.text, targetOffset);
        const next: Selection = {
          anchor: { blockId: block.id, offset: range.start },
          focus: { blockId: block.id, offset: range.end },
        };
        syncSelection(next);
      } else {
        syncSelection(collapsedAt({ blockId: target.blockId, offset: targetOffset }));
      }
      inputRef.current?.focus({ preventScroll: true });
      onStatus?.(clickCount >= 3 ? "Parágrafo selecionado." : clickCount >= 2 ? "Palavra selecionada." : "SmartCanvas: cursor no bloco " + target.blockId + ", posição " + target.position.offset + ".");
    } else if (target.kind === "table-cell") {
      setActiveBlockId(null);
      const cell = collectTableCells(engine.getDocument().content).find(item => item.tableId === target.blockId && item.cellId === target.cellId);
      if (!cell) { onStatus?.("Não foi possível localizar a célula selecionada."); return; }
      const boundedOffset = nearestGraphemeOffset(cell.text, target.offset);
      const range = clickCount >= 3 ? { start: 0, end: cell.text.length } : clickCount >= 2 ? wordRangeAt(cell.text, boundedOffset) : { start: boundedOffset, end: boundedOffset };
      setActiveCell({ ...cell, anchorOffset: range.start, offset: range.end });
      setActiveCellStoredMarks(null);
      inputRef.current?.focus({ preventScroll: true });
      onStatus?.(clickCount >= 3 ? "Texto da célula selecionado." : clickCount >= 2 ? "Palavra da célula selecionada." : "Editando célula da tabela. Use Tab para avançar entre células.");
    } else {
      setActiveBlockId(target.blockId);
      const selectedBlock = findDocumentNode(engine.getDocument().content, target.blockId);
      if (selectedBlock?.type === "image") {
        setImageAltDraft(selectedBlock.alt ?? "");
        setImageWidthDraft(selectedBlock.width == null ? "" : String(selectedBlock.width));
        setImageHeightDraft(selectedBlock.height == null ? "" : String(selectedBlock.height));
      }
      if (selectedBlock?.editorObject) {
        setObjectLabelDraft(selectedBlock.editorObject.label ?? "");
        setObjectWidthDraft(String(selectedBlock.editorObject.width ?? 120));
        setObjectHeightDraft(String(selectedBlock.editorObject.height ?? 60));
        setObjectFillDraft(selectedBlock.editorObject.fill ?? "#ffffff");
        setObjectStrokeDraft(selectedBlock.editorObject.stroke ?? "#111827");
      }
      setSelection(null);
      engine.setSelection(undefined);
      inputRef.current?.focus({ preventScroll: true });
      onStatus?.(selectedBlock?.type === "image"
        ? "Imagem selecionada. Edite o texto alternativo e as dimensões nos controles do SmartCanvas."
        : "Bloco " + target.blockId + " selecionado no SmartCanvas. Use os comandos de objeto disponíveis para operar este bloco.");
    }
  };
  const applySmartCanvasMark = (mark: Mark) => {
    if (readOnly) return;
    if (activeCell) {
      const start = Math.min(activeCell.anchorOffset, activeCell.offset);
      const end = Math.max(activeCell.anchorOffset, activeCell.offset);
      if (start === end) {
        const currentMarks = activeCellStoredMarks ?? marksAtCellOffset(engine.getDocument().content, activeCell, activeCell.offset);
        const existing = currentMarks.find(item => item.type === mark.type);
        const nextMarks = existing
          ? currentMarks.filter(item => item.type !== mark.type)
          : [...currentMarks.filter(item => item.type !== mark.type), mark];
        setActiveCellStoredMarks(nextMarks);
        return;
      }
      const paragraphs = collectCellParagraphs(engine.getDocument().content, activeCell.tableId, activeCell.rowId, activeCell.cellId);
      const commands = paragraphs.flatMap(paragraph => {
        const localStart = Math.max(0, start - paragraph.start);
        const localEnd = Math.min(paragraph.text.length, end - paragraph.start);
        return localEnd > localStart
          ? [toggleMarkCommand({ blockId: paragraph.id, start: localStart, end: localEnd, mark })]
          : [];
      });
      if (!commands.length) {
        onStatus?.("Não foi possível mapear a seleção da célula para o motor.");
        return;
      }
      const result = engine.exec(commands, { group: "formatting" });
      if (!result.ok) onStatus?.(result.error.message);
      else {
        setActiveCellStoredMarks(null);
        onDocumentChange(result.value.document);
        onStatus?.("Formatação aplicada pelo SmartCanvas.");
      }
      return;
    }
    const current = engine.getSelection();
    if (!current) {
      onStatus?.("Selecione um ponto de inserção ou um trecho de texto.");
      return;
    }
    if (current.anchor.blockId === current.focus.blockId && current.anchor.offset === current.focus.offset) {
      const before = engine.getDocument();
      const result = engine.toggleStoredMark(mark);
      if (!result.ok) onStatus?.(result.error.message);
      else {
        setSelection(engine.getSelection() ?? null);
        if (engine.getDocument() !== before) onDocumentChange(engine.getDocument());
        onStatus?.("Formatação de digitação atualizada.");
      }
      return;
    }
    const blocks = collectTextBlocks(engine.getDocument().content);
    const anchorIndex = blocks.findIndex(block => block.id === current.anchor.blockId);
    const focusIndex = blocks.findIndex(block => block.id === current.focus.blockId);
    if (anchorIndex < 0 || focusIndex < 0) {
      onStatus?.("A seleção atual não corresponde a blocos de texto editáveis.");
      return;
    }
    const firstIndex = Math.min(anchorIndex, focusIndex);
    const lastIndex = Math.max(anchorIndex, focusIndex);
    const start = anchorIndex < focusIndex ? current.anchor.offset : current.focus.offset;
    const end = anchorIndex < focusIndex ? current.focus.offset : current.anchor.offset;
    const commands = blocks.slice(firstIndex, lastIndex + 1).flatMap((block, index) => {
      const from = index === 0 ? start : 0;
      const to = index === lastIndex - firstIndex ? end : block.text.length;
      return to > from ? [toggleMarkCommand({ blockId: block.id, start: from, end: to, mark })] : [];
    });
    if (!commands.length) {
      onStatus?.("Selecione texto para aplicar a formatação.");
      return;
    }
    const result = engine.exec(commands, { group: "formatting" });
    if (!result.ok) onStatus?.(result.error.message);
    else {
      setSelection(engine.getSelection() ?? null);
      onDocumentChange(result.value.document);
      onStatus?.("Formatação aplicada pelo SmartCanvas.");
    }
  };
  const mutateActiveTable = (action: "add-row" | "add-column" | "remove-row" | "remove-column") => {
    if (readOnly || !activeCell) {
      onStatus?.("Selecione uma célula antes de alterar a estrutura da tabela.");
      return;
    }
    const document = engine.getDocument();
    const table = document.content.find(block => block.type === "table" && block.id === activeCell.tableId);
    if (!table || table.type !== "table") {
      onStatus?.("A tabela selecionada não está mais disponível.");
      return;
    }
    const row = table.children.find(item => item.id === activeCell.rowId);
    const columnIndex = row?.children.findIndex(cell => cell.id === activeCell.cellId) ?? -1;
    let command;
    let message = "";
    const resetCell = action === "remove-row" || action === "remove-column";
    switch (action) {
      case "add-row":
        command = addTableRow({ tableId: activeCell.tableId, afterRowId: activeCell.rowId });
        message = "Linha adicionada à tabela.";
        break;
      case "add-column":
        command = addTableColumn({ tableId: activeCell.tableId, afterColumnIndex: Math.max(0, columnIndex) });
        message = "Coluna adicionada à tabela.";
        break;
      case "remove-row":
        command = removeTableRow({ tableId: activeCell.tableId, rowId: activeCell.rowId });
        message = "Linha removida da tabela.";
        break;
      case "remove-column":
        command = removeTableColumn({ tableId: activeCell.tableId, columnIndex: Math.max(0, columnIndex) });
        message = "Coluna removida da tabela.";
        break;
    }
    const result = engine.exec([command], { group: "structural" });
    if (!result.ok) {
      onStatus?.("Não foi possível alterar a tabela: " + result.error.message);
      return;
    }
    if (resetCell) {
      const updatedTable = result.value.document.content.find(block => block.type === "table" && block.id === activeCell.tableId);
      const firstCell = updatedTable?.type === "table" ? collectTableCells([updatedTable])[0] : undefined;
      if (firstCell) setActiveCell({ ...firstCell, anchorOffset: 0, offset: 0 });
      else setActiveCell(null);
      setActiveCellStoredMarks(null);
    }
    onDocumentChange(result.value.document);
    onStatus?.(message);
    inputRef.current?.focus({ preventScroll: true });
  };
  const getSelectedTopLevelTextBlock = () => {
    const current = engine.getSelection();
    if (!current) return undefined;
    return engine.getDocument().content.find(block =>
      block.id === current.focus.blockId && (block.type === "paragraph" || block.type === "heading")
    );
  };
  const applySmartCanvasHeading = () => {
    if (readOnly) return;
    const block = getSelectedTopLevelTextBlock();
    if (!block) {
      onStatus?.("Selecione um parágrafo de nível superior para alterar o estilo do título.");
      return;
    }
    const level = headingLevelDraft === "paragraph" ? "paragraph" : Number(headingLevelDraft);
    if (level !== "paragraph" && (typeof level !== "number" || ![1, 2, 3, 4, 5, 6].includes(level))) return;
    const result = engine.exec([setHeadingLevel({ blockId: block.id, level: level as 1 | 2 | 3 | 4 | 5 | 6 | "paragraph" })], { group: "structural" });
    if (!result.ok) onStatus?.(result.error.message);
    else {
      setSelection(engine.getSelection() ?? null);
      onDocumentChange(result.value.document);
      onStatus?.(level === "paragraph" ? "Estilo de parágrafo aplicado." : "Título " + level + " aplicado pelo SmartCanvas.");
    }
  };
  const convertSmartCanvasBlockquote = () => {
    if (readOnly) return;
    const block = getSelectedTopLevelTextBlock();
    if (!block) {
      onStatus?.("Selecione um parágrafo de nível superior para transformá-lo em citação.");
      return;
    }
    const result = engine.exec([convertBlockToBlockquote({ blockId: block.id })], { group: "structural" });
    if (!result.ok) onStatus?.(result.error.message);
    else {
      setSelection(engine.getSelection() ?? null);
      onDocumentChange(result.value.document);
      onStatus?.("Citação em bloco criada pelo SmartCanvas.");
    }
  };
  const insertSmartCanvasBreak = (kind: "page" | "rule") => {
    if (readOnly) return;
    const current = engine.getSelection();
    const selectedTopLevel = current
      ? engine.getDocument().content.find(block =>
          block.id === current.focus.blockId && (block.type === "paragraph" || block.type === "heading")
        )
      : undefined;
    const afterBlockId = activeCell?.tableId ?? selectedTopLevel?.id;
    if (!afterBlockId) {
      onStatus?.("Selecione um parágrafo ou uma tabela antes de inserir uma quebra.");
      return;
    }
    const command = kind === "page" ? insertPageBreak({ afterBlockId }) : insertThematicBreak({ afterBlockId, kind: "rule" });
    const result = engine.exec([command], { group: "structural" });
    if (!result.ok) onStatus?.(result.error.message);
    else {
      onDocumentChange(result.value.document);
      onStatus?.(kind === "page" ? "Quebra de página inserida pelo SmartCanvas." : "Linha horizontal inserida pelo SmartCanvas.");
    }
  };
  const convertSmartCanvasList = (ordered: boolean) => {
    if (readOnly) return;
    const current = engine.getSelection();
    const block = current
      ? engine.getDocument().content.find(item =>
          item.id === current.focus.blockId && (item.type === "paragraph" || item.type === "heading")
        )
      : undefined;
    if (!block) {
      onStatus?.("Para criar uma lista, posicione o cursor em um parágrafo de nível superior.");
      return;
    }
    const result = engine.exec([convertBlockToList({ blockId: block.id, ordered })], { group: "structural" });
    if (!result.ok) {
      onStatus?.("Não foi possível criar a lista: " + result.error.message);
      return;
    }
    setSelection(engine.getSelection() ?? null);
    onDocumentChange(result.value.document);
    onStatus?.(ordered ? "Lista numerada criada pelo SmartCanvas." : "Lista com marcadores criada pelo SmartCanvas.");
    inputRef.current?.focus({ preventScroll: true });
  };
  const insertSmartCanvasTable = () => {
    if (readOnly) return;
    const current = engine.getSelection();
    const target = current
      ? engine.getDocument().content.find(block =>
          block.id === current.focus.blockId && (block.type === "paragraph" || block.type === "heading")
        )
      : undefined;
    if (!target) {
      onStatus?.("Posicione o cursor em um parágrafo de nível superior para inserir uma tabela.");
      return;
    }
    const existingTableIds = new Set(engine.getDocument().content.filter(block => block.type === "table").map(block => block.id));
    const result = engine.exec([insertTableCommand({ afterBlockId: target.id, rows: 3, columns: 3 })], { group: "structural" });
    if (!result.ok) {
      onStatus?.("Não foi possível inserir a tabela: " + result.error.message);
      return;
    }
    const insertedTable = result.value.document.content.find(block => block.type === "table" && !existingTableIds.has(block.id));
    const firstCell = insertedTable?.type === "table"
      ? collectTableCells([insertedTable])[0]
      : undefined;
    if (firstCell) {
      setActiveCell({ ...firstCell, anchorOffset: 0, offset: 0 });
      setActiveCellStoredMarks(null);
      setActiveBlockId(null);
      setSelection(null);
      engine.setSelection(undefined);
    }
    onDocumentChange(result.value.document);
    onStatus?.("Tabela 3×3 inserida pelo motor. Use Tab para navegar e criar novas linhas.");
    inputRef.current?.focus({ preventScroll: true });
  };
  const applySmartCanvasIndent = (direction: "increase" | "decrease") => {
    if (readOnly) return;
    const blockId = activeCell
      ? collectCellParagraphs(engine.getDocument().content, activeCell.tableId, activeCell.rowId, activeCell.cellId)
          .find(item => activeCell.offset >= item.start && activeCell.offset <= item.start + item.text.length)?.id
      : engine.getSelection()?.focus.blockId;
    if (!blockId) {
      onStatus?.("Selecione um parágrafo antes de alterar o recuo.");
      return;
    }
    const target = findDocumentNode(engine.getDocument().content, blockId);
    const currentIndent = target?.indent ?? 0;
    const nextIndent = Math.max(0, Math.min(720, currentIndent + (direction === "increase" ? 18 : -18)));
    const result = engine.exec([setIndent({ blockId, indent: nextIndent })], { group: "formatting" });
    if (!result.ok) onStatus?.(result.error.message);
    else {
      onDocumentChange(result.value.document);
      onStatus?.("Recuo do parágrafo atualizado pelo SmartCanvas.");
    }
  };
  const applySmartCanvasParagraphSpacing = () => {
    if (readOnly) return;
    const blockId = activeCell
      ? collectCellParagraphs(engine.getDocument().content, activeCell.tableId, activeCell.rowId, activeCell.cellId)
          .find(item => activeCell.offset >= item.start && activeCell.offset <= item.start + item.text.length)?.id
      : engine.getSelection()?.focus.blockId;
    if (!blockId) {
      onStatus?.("Selecione um parágrafo antes de alterar o espaçamento.");
      return;
    }
    const lineSpacing = Number(lineSpacingDraft);
    const spacingAfter = Number(spacingAfterDraft);
    if (!Number.isFinite(lineSpacing) || lineSpacing < 0.5 || lineSpacing > 4 || !Number.isFinite(spacingAfter) || spacingAfter < 0 || spacingAfter > 720) {
      onStatus?.("Entrelinha deve ficar entre 0,5 e 4; espaçamento posterior entre 0 e 720 pontos.");
      return;
    }
    const result = engine.exec([setParagraphStyle({ blockId, lineSpacing, spacingAfter })], { group: "formatting" });
    if (!result.ok) onStatus?.(result.error.message);
    else {
      onDocumentChange(result.value.document);
      onStatus?.("Espaçamento do parágrafo atualizado pelo SmartCanvas.");
    }
  };
  const applySmartCanvasLink = () => {
    const raw = linkDraft.trim();
    let parsed: URL;
    try { parsed = new URL(raw); }
    catch {
      onStatus?.("Informe um link absoluto válido (https://, http:// ou mailto:).");
      return;
    }
    if (!["https:", "http:", "mailto:"].includes(parsed.protocol)) {
      onStatus?.("Por segurança, o SmartCanvas só permite links HTTP, HTTPS ou mailto.");
      return;
    }
    applySmartCanvasMark({ type: "link", value: parsed.href });
  };
  const applySmartCanvasAlignment = (align: "start" | "center" | "end" | "justify") => {
    if (readOnly) return;
    let blockId = engine.getSelection()?.focus.blockId;
    if (activeCell) {
      const paragraph = collectCellParagraphs(engine.getDocument().content, activeCell.tableId, activeCell.rowId, activeCell.cellId)
        .find(item => activeCell.offset >= item.start && activeCell.offset <= item.start + item.text.length);
      blockId = paragraph?.id;
    }
    if (!blockId) {
      onStatus?.("Selecione um parágrafo antes de alterar o alinhamento.");
      return;
    }
    const result = engine.exec([setAlign({ blockId, align })], { group: "formatting" });
    if (!result.ok) onStatus?.(result.error.message);
    else {
      onDocumentChange(result.value.document);
      onStatus?.("Alinhamento atualizado pelo SmartCanvas.");
    }
  };
  const insertSmartCanvasImageFile = (file: File) => {
    if (readOnly) return;
    const targetCell = activeCell ? { tableId: activeCell.tableId, rowId: activeCell.rowId, cellId: activeCell.cellId } : null;
    const current = engine.getSelection();
    const selectedBlock = !targetCell && current
      ? engine.getDocument().content.find(block =>
          block.id === current.focus.blockId && (block.type === "paragraph" || block.type === "heading")
        )
      : undefined;
    if (!targetCell && !selectedBlock) {
      onStatus?.("Selecione uma célula, parágrafo ou título antes de inserir uma imagem.");
      return;
    }
    void readClipboardImage(file).then(({ mimeType, data }) => {
      const commands = targetCell
        ? [insertTableCellImageResource({ ...targetCell, mimeType, data, alt: file.name.slice(0, 2000), name: file.name.slice(0, 255), width: 120, height: 96 })]
        : selectedBlock && engine.getDocument().content.some(block => block.id === selectedBlock.id)
          ? [insertImageResource({ afterBlockId: selectedBlock.id, mimeType, data, alt: file.name.slice(0, 2000), name: file.name.slice(0, 255) })]
          : null;
      if (!commands) {
        onStatus?.("A posição de inserção mudou; selecione novamente o local da imagem.");
        return;
      }
      const result = engine.exec(commands, { group: "structural" });
      if (!result.ok) {
        onStatus?.("Não foi possível inserir a imagem: " + result.error.message);
        return;
      }
      const inserted = [...result.value.document.content].reverse().find(block =>
        block.type === "image" && result.value.document.resources.some(resource => resource.id === block.resourceId && resource.data === data)
      );
      if (!targetCell) {
        setSelection(null);
        engine.setSelection(undefined);
        setActiveCell(null);
        setActiveBlockId(inserted?.id ?? null);
        if (inserted?.type === "image") {
          setImageAltDraft(inserted.alt);
          setImageWidthDraft(inserted.width == null ? "" : String(inserted.width));
          setImageHeightDraft(inserted.height == null ? "" : String(inserted.height));
        }
      }
      onDocumentChange(result.value.document);
      onStatus?.(targetCell ? "Imagem inserida na célula da tabela pelo SmartCanvas." : "Imagem inserida pelo SmartCanvas.");
    }).catch(error => {
      onStatus?.(error instanceof Error ? error.message : "Não foi possível ler o arquivo de imagem.");
    });
  };
  const applySelectedImageProperties = () => {
    if (readOnly || !activeBlockId) return;
    const selected = findDocumentNode(engine.getDocument().content, activeBlockId);
    if (!selected || selected.type !== "image") return;
    const width = imageWidthDraft.trim() === "" ? null : Number(imageWidthDraft);
    const height = imageHeightDraft.trim() === "" ? null : Number(imageHeightDraft);
    if ((width !== null && (!Number.isFinite(width) || width <= 0 || width > 2000)) ||
        (height !== null && (!Number.isFinite(height) || height <= 0 || height > 2000))) {
      onStatus?.("Largura e altura devem estar entre 1 e 2000 pixels, ou vazias para usar o tamanho automático.");
      return;
    }
    const result = engine.exec([updateImage({
      blockId: activeBlockId,
      alt: imageAltDraft,
      width,
      height,
    })], { group: "structural" });
    if (!result.ok) {
      onStatus?.("Não foi possível atualizar a imagem: " + result.error.message);
      return;
    }
    onDocumentChange(result.value.document);
    onStatus?.("Propriedades da imagem atualizadas.");
  };
  const applySelectedObjectProperties = () => {
    if (readOnly || !activeBlockId) return;
    const selected = findDocumentNode(engine.getDocument().content, activeBlockId);
    if (!selected?.editorObject) return;
    const width = Number(objectWidthDraft);
    const height = Number(objectHeightDraft);
    if (!Number.isFinite(width) || width < 1 || width > 2000 || !Number.isFinite(height) || height < 1 || height > 2000) {
      onStatus?.("Largura e altura do objeto devem estar entre 1 e 2000 pontos.");
      return;
    }
    if (objectLabelDraft.length > 200 || !/^#[0-9a-f]{6}$/i.test(objectFillDraft) || !/^#[0-9a-f]{6}$/i.test(objectStrokeDraft)) {
      onStatus?.("Informe um rótulo de até 200 caracteres e cores hexadecimais válidas.");
      return;
    }
    const result = engine.exec([updateEditorObject({
      blockId: activeBlockId,
      patch: { label: objectLabelDraft, width, height, fill: objectFillDraft, stroke: objectStrokeDraft },
    })], { group: "structural" });
    if (!result.ok) {
      onStatus?.("Não foi possível atualizar o objeto: " + result.error.message);
      return;
    }
    onDocumentChange(result.value.document);
    onStatus?.("Propriedades do objeto atualizadas pelo motor.");
  };
  const moveSelectedObject = (direction: "up" | "down") => {
    if (readOnly || !activeBlockId) return;
    const result = engine.exec([moveBlock({ blockId: activeBlockId, direction })], { group: "structural" });
    if (!result.ok) {
      onStatus?.("Não foi possível mover o objeto: " + result.error.message);
      return;
    }
    onDocumentChange(result.value.document);
    onStatus?.(direction === "up" ? "Objeto movido para cima no documento." : "Objeto movido para baixo no documento.");
  };
  const commitText = (text: string) => {
    if (!text || readOnly) return;
    const current = engine.getSelection();
    if (current && current.anchor.blockId !== current.focus.blockId) {
      const documentContent = engine.getDocument().content;
      const ranges = getSmartCanvasTextSelectionRanges(documentContent, current);
      if (!ranges) {
        onStatus?.("A seleção inclui um bloco que não aceita edição textual.");
        return;
      }
      const topLevelTextOnly = ranges.every(range =>
        documentContent.some(block =>
          (block.type === "paragraph" || block.type === "heading") && block.id === range.block.id
        )
      );
      if (!topLevelTextOnly) {
        const firstRange = ranges[0]!;
        const commands = ranges
          .filter(range => range.end > range.start)
          .map(range => deleteText({ blockId: range.block.id, start: range.start, end: range.end }));
        commands.push(insertText({
          blockId: firstRange.block.id,
          offset: firstRange.start,
          text,
          marks: marksAtTextOffset(documentContent, firstRange.block.id, firstRange.start, engine),
        }));
        const result = engine.exec(commands, { group: "structural" });
        if (!result.ok) { onStatus?.("Não foi possível substituir a seleção entre estruturas: " + result.error.message); return; }
        syncSelection(result.value.selection);
        onDocumentChange(result.value.document);
        return;
      }
      const blocks = ranges.map(range => ({ id: range.block.id, text: getPlainText(range.block) }));
      const anchorIndex = blocks.findIndex(block => block.id === current.anchor.blockId);
      const focusIndex = blocks.findIndex(block => block.id === current.focus.blockId);
      const firstIndex = Math.min(anchorIndex, focusIndex);
      const lastIndex = Math.max(anchorIndex, focusIndex);
      const first = blocks[firstIndex]!;
      const last = blocks[lastIndex]!;
      const start = anchorIndex < focusIndex ? current.anchor.offset : current.focus.offset;
      const end = anchorIndex < focusIndex ? current.focus.offset : current.anchor.offset;
      const commands = [];
      if (start < first.text.length) commands.push(deleteText({ blockId: first.id, start, end: first.text.length }));
      for (const block of blocks.slice(firstIndex + 1, lastIndex)) {
        if (block.text.length) commands.push(deleteText({ blockId: block.id, start: 0, end: block.text.length }));
      }
      if (end > 0) commands.push(deleteText({ blockId: last.id, start: 0, end }));
      for (const block of blocks.slice(firstIndex + 1, lastIndex + 1)) commands.push(mergeBlockWithPrevious({ blockId: block.id }));
      commands.push(insertText({ blockId: first.id, offset: start, text, marks: marksAtTextOffset(documentContent, first.id, start, engine) }));
      const result = engine.exec(commands, { group: "structural" });
      if (!result.ok) { onStatus?.("Não foi possível substituir a seleção entre blocos: " + result.error.message); return; }
      syncSelection(result.value.selection);
      onDocumentChange(result.value.document);
      return;
    }
    const result = engine.insertTextAtSelection(text);
    if (!result.ok) { onStatus?.(result.error.message); return; }
    syncSelection(result.value.selection);
    onDocumentChange(result.value.document);
  };
  const refreshActiveCell = (nextDocument: NexusDocument) => {
    setActiveCell(current => {
      if (!current) return null;
      const restored = collectTableCells(nextDocument.content).find(cell =>
        cell.tableId === current.tableId && cell.rowId === current.rowId && cell.cellId === current.cellId
      );
      if (!restored) return null;
      return {
        ...restored,
        anchorOffset: Math.min(current.anchorOffset, restored.text.length),
        offset: Math.min(current.offset, restored.text.length),
      };
    });
  };
  const commitCellText = (nextText: string, nextOffset: number) => {
    if (!activeCell || readOnly) return;
    const result = engine.exec([setCellText({ tableId: activeCell.tableId, rowId: activeCell.rowId, cellId: activeCell.cellId, text: nextText, ...(activeCellStoredMarks !== null ? { insertionMarks: activeCellStoredMarks } : {}) })], { group: "typing" });
    if (!result.ok) { onStatus?.(result.error.message); return; }
    setActiveCell({ ...activeCell, text: nextText, anchorOffset: nextOffset, offset: nextOffset });
    onDocumentChange(result.value.document);
  };
  const handleInput = (value: string) => {
    preferredVerticalX.current = null;
    preferredCellColumn.current = null;
    if (value && activeCell) {
      const start = Math.min(activeCell.anchorOffset, activeCell.offset);
      const end = Math.max(activeCell.anchorOffset, activeCell.offset);
      const nextText = activeCell.text.slice(0, start) + value + activeCell.text.slice(end);
      commitCellText(nextText, start + value.length);
    } else if (value) commitText(value);
    if (inputRef.current) inputRef.current.value = "";
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      preferredVerticalX.current = null;
      preferredCellColumn.current = null;
    }
    if (readOnly) { event.preventDefault(); return; }
    if (activeCell) {
      if ((event.ctrlKey || event.metaKey) && ["b", "i", "u"].includes(event.key.toLowerCase())) {
        event.preventDefault();
        const key = event.key.toLowerCase();
        const mark = key === "b" ? { type: "bold" as const } : key === "i" ? { type: "italic" as const } : { type: "underline" as const };
        const start = Math.min(activeCell.anchorOffset, activeCell.offset);
        const end = Math.max(activeCell.anchorOffset, activeCell.offset);
        if (start === end) {
          const currentMarks = activeCellStoredMarks ?? marksAtCellOffset(engine.getDocument().content, activeCell, activeCell.offset);
          const hasMark = currentMarks.some(item => item.type === mark.type);
          const nextMarks = hasMark
            ? currentMarks.filter(item => item.type !== mark.type)
            : [...currentMarks.filter(item => item.type !== mark.type), mark];
          setActiveCellStoredMarks(nextMarks);
          onStatus?.(hasMark
            ? "Formatação removida da digitação seguinte na célula."
            : "Formatação ativada para o texto digitado em seguida na célula.");
          return;
        }
        setActiveCellStoredMarks(null);
        const paragraphs = collectCellParagraphs(engine.getDocument().content, activeCell.tableId, activeCell.rowId, activeCell.cellId);
        const commands = paragraphs.flatMap(paragraph => {
          const localStart = Math.max(0, start - paragraph.start);
          const localEnd = Math.min(paragraph.text.length, end - paragraph.start);
          return localEnd > localStart
            ? [toggleMarkCommand({ blockId: paragraph.id, start: localStart, end: localEnd, mark })]
            : [];
        });
        if (!commands.length) {
          onStatus?.("Não foi possível mapear o intervalo selecionado para os parágrafos da célula.");
          return;
        }
        const result = engine.exec(commands, { group: "formatting" });
        if (!result.ok) onStatus?.(result.error.message);
        else {
          onDocumentChange(result.value.document);
          onStatus?.("Formatação aplicada ao texto selecionado na célula.");
        }
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setActiveCell({ ...activeCell, anchorOffset: 0, offset: activeCell.text.length });
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setActiveCell(null);
        setActiveCellStoredMarks(null);
        inputRef.current?.blur();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const start = Math.min(activeCell.anchorOffset, activeCell.offset);
        const end = Math.max(activeCell.anchorOffset, activeCell.offset);
        commitCellText(activeCell.text.slice(0, start) + "\n" + activeCell.text.slice(end), start + 1);
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        const cells = collectTableCells(engine.getDocument().content).filter(cell => cell.tableId === activeCell.tableId);
        const index = cells.findIndex(cell => cell.cellId === activeCell.cellId);
        if (!event.shiftKey && index === cells.length - 1) {
          const existingRowIds = new Set(cells.map(cell => cell.rowId));
          const result = engine.exec([addTableRow({ tableId: activeCell.tableId, afterRowId: activeCell.rowId })], { group: "structural" });
          if (!result.ok) {
            onStatus?.(result.error.message);
            return;
          }
          const addedCells = collectTableCells(result.value.document.content).filter(cell =>
            cell.tableId === activeCell.tableId && !existingRowIds.has(cell.rowId)
          );
          const firstCell = addedCells[0];
          if (firstCell) setActiveCell({ ...firstCell, anchorOffset: 0, offset: 0 });
          setActiveCellStoredMarks(null);
          onDocumentChange(result.value.document);
          onStatus?.("Nova linha adicionada à tabela.");
          return;
        }
        const nextIndex = event.shiftKey ? Math.max(0, index - 1) : Math.min(cells.length - 1, index + 1);
        const next = cells[nextIndex];
        if (next) {
          const offset = event.shiftKey ? next.text.length : 0;
          setActiveCell({ ...next, anchorOffset: offset, offset });
          setActiveCellStoredMarks(null);
        }
        return;
      }
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        const lineStart = lineStartOffset(activeCell.text, activeCell.offset);
        if (preferredCellColumn.current === null) preferredCellColumn.current = activeCell.offset - lineStart;
        const offset = verticalLineOffset(activeCell.text, activeCell.offset, event.key === "ArrowUp" ? -1 : 1, preferredCellColumn.current);
        setActiveCell({ ...activeCell, anchorOffset: event.shiftKey ? activeCell.anchorOffset : offset, offset });
        if (!event.shiftKey) setActiveCellStoredMarks(null);
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "Home" || event.key === "End") {
        event.preventDefault();
        const hasRange = activeCell.anchorOffset !== activeCell.offset;
        if (!event.shiftKey && !hasRange && !event.ctrlKey && !event.metaKey) {
          const atCellStart = event.key === "ArrowLeft" && activeCell.offset === 0;
          const atCellEnd = event.key === "ArrowRight" && activeCell.offset === activeCell.text.length;
          if (atCellStart || atCellEnd) {
            const cells = collectTableCells(engine.getDocument().content);
            const currentIndex = cells.findIndex(cell => cell.tableId === activeCell.tableId && cell.rowId === activeCell.rowId && cell.cellId === activeCell.cellId);
            const nextIndex = currentIndex + (atCellStart ? -1 : 1);
            const next = currentIndex >= 0 ? cells[nextIndex] : undefined;
            if (next) {
              const offset = atCellStart ? next.text.length : 0;
              setActiveCell({ ...next, anchorOffset: offset, offset });
              setActiveCellStoredMarks(null);
              return;
            }
          }
        }
        const orderedStart = Math.min(activeCell.anchorOffset, activeCell.offset);
        const orderedEnd = Math.max(activeCell.anchorOffset, activeCell.offset);
        const offset = event.key === "Home"
          ? (event.ctrlKey || event.metaKey ? 0 : lineStartOffset(activeCell.text, activeCell.offset))
          : event.key === "End"
            ? (event.ctrlKey || event.metaKey ? activeCell.text.length : lineEndOffset(activeCell.text, activeCell.offset))
            : event.key === "ArrowLeft"
              ? (hasRange && !event.shiftKey ? orderedStart : event.ctrlKey || event.metaKey ? previousWordOffset(activeCell.text, activeCell.offset) : previousCodePointOffset(activeCell.text, activeCell.offset))
              : (hasRange && !event.shiftKey ? orderedEnd : event.ctrlKey || event.metaKey ? nextWordOffset(activeCell.text, activeCell.offset) : nextCodePointOffset(activeCell.text, activeCell.offset));
        setActiveCell({ ...activeCell, anchorOffset: event.shiftKey ? activeCell.anchorOffset : offset, offset });
        if (!event.shiftKey) setActiveCellStoredMarks(null);
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        let start = Math.min(activeCell.anchorOffset, activeCell.offset);
        let end = Math.max(activeCell.anchorOffset, activeCell.offset);
        if (start === end) {
          if (event.key === "Backspace") start = event.ctrlKey || event.metaKey ? previousWordOffset(activeCell.text, start) : previousCodePointOffset(activeCell.text, start);
          else end = event.ctrlKey || event.metaKey ? nextWordOffset(activeCell.text, end) : nextCodePointOffset(activeCell.text, end);
        }
        if (start !== end) commitCellText(activeCell.text.slice(0, start) + activeCell.text.slice(end), start);
        return;
      }
    }
    if ((event.key === "Backspace" || event.key === "Delete") && activeBlockId) {
      event.preventDefault();
      const selectedBlock = findDocumentNode(engine.getDocument().content, activeBlockId);
      const deleteCommand = selectedBlock?.type === "image"
        ? removeImage({ blockId: activeBlockId })
        : deleteBlock({ blockId: activeBlockId });
      const result = engine.exec([deleteCommand], { group: "structural" });
      if (!result.ok) {
        onStatus?.(result.error.message);
        return;
      }
      setActiveBlockId(null);
      setSelection(result.value.selection ?? null);
      engine.setSelection(result.value.selection);
      onDocumentChange(result.value.document);
      onStatus?.("Bloco removido.");
      return;
    }
    if (event.key === "Escape" && activeBlockId) {
      event.preventDefault();
      setActiveBlockId(null);
      setSelection(null);
      engine.setSelection(undefined);
      onStatus?.("Seleção do bloco removida.");
      return;
    }
    // Formatting shortcuts are routed to the engine, including stored marks for future typing.
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      const key = event.key.toLowerCase();
      const mark = key === "b" ? { type: "bold" as const }
        : key === "i" ? { type: "italic" as const }
        : key === "u" ? { type: "underline" as const }
        : key === "x" && event.shiftKey ? { type: "strike" as const }
        : null;
      if (mark) {
        event.preventDefault();
        const current = engine.getSelection();
        if (current && current.anchor.blockId !== current.focus.blockId) {
          const blocks = collectTextBlocks(engine.getDocument().content);
          const anchorIndex = blocks.findIndex(item => item.id === current.anchor.blockId);
          const focusIndex = blocks.findIndex(item => item.id === current.focus.blockId);
          if (anchorIndex < 0 || focusIndex < 0) {
            onStatus?.("A seleção não corresponde a blocos de texto formatáveis.");
            return;
          }
          const firstIndex = Math.min(anchorIndex, focusIndex);
          const lastIndex = Math.max(anchorIndex, focusIndex);
          const start = anchorIndex < focusIndex ? current.anchor.offset : current.focus.offset;
          const end = anchorIndex < focusIndex ? current.focus.offset : current.anchor.offset;
          const commands = blocks.slice(firstIndex, lastIndex + 1).flatMap((block, index) => {
            const from = index === 0 ? start : 0;
            const to = index === lastIndex - firstIndex ? end : block.text.length;
            return to > from ? [toggleMarkCommand({ blockId: block.id, start: from, end: to, mark })] : [];
          });
          if (!commands.length) { onStatus?.("Selecione texto para aplicar a formatação."); return; }
          const result = engine.exec(commands, { group: "formatting" });
          if (!result.ok) onStatus?.(result.error.message);
          else {
            setSelection(engine.getSelection() ?? null);
            onDocumentChange(result.value.document);
            onStatus?.("Formatação aplicada à seleção de vários blocos.");
          }
          return;
        }
        const documentBefore = engine.getDocument();
        const result = engine.toggleStoredMark(mark);
        if (!result.ok) onStatus?.(result.error.message);
        else {
          setSelection(engine.getSelection() ?? null);
          if (engine.getDocument() !== documentBefore) onDocumentChange(engine.getDocument());
          onStatus?.(current && (current.anchor.blockId !== current.focus.blockId || current.anchor.offset !== current.focus.offset)
            ? "Formatação aplicada à seleção."
            : "Formatação de digitação atualizada.");
        }
        return;
      }
    }
    if ((event.ctrlKey || event.metaKey) && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      const current = engine.getSelection();
      if (current && current.anchor.blockId === current.focus.blockId) {
        const block = findBlock(engine.getDocument().content, current.focus.blockId);
        if (block) {
          event.preventDefault();
          const focusOffset = event.key === "ArrowLeft"
            ? previousWordOffset(block.text, current.focus.offset)
            : nextWordOffset(block.text, current.focus.offset);
          const focus = { blockId: block.id, offset: focusOffset };
          syncSelection(event.shiftKey ? { anchor: current.anchor, focus } : collapsedAt(focus));
          return;
        }
      }
    }
    if (event.key === "F2") {
      const current = engine.getSelection();
      if (current && current.anchor.blockId === current.focus.blockId) {
        const block = findBlock(engine.getDocument().content, current.focus.blockId);
        if (block) {
          event.preventDefault();
          const range = wordRangeAt(block.text, current.focus.offset);
          syncSelection({ anchor: { blockId: block.id, offset: range.start }, focus: { blockId: block.id, offset: range.end } });
          return;
        }
      }
    }
    if ((event.ctrlKey || event.metaKey) && (event.key === "Home" || event.key === "End")) {
      const blocks = collectSmartCanvasTextBlocks(engine.getDocument().content).map(block => ({ id: block.id, text: getPlainText(block) }));
      if (blocks.length) {
        event.preventDefault();
        const block = event.key === "Home" ? blocks[0] : blocks[blocks.length - 1];
        const focus = { blockId: block.id, offset: event.key === "Home" ? 0 : block.text.length };
        syncSelection(event.shiftKey && engine.getSelection() ? { anchor: engine.getSelection()!.anchor, focus } : collapsedAt(focus));
        return;
      }
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      const blocks = collectSmartCanvasTextBlocks(engine.getDocument().content).map(block => ({ id: block.id, text: getPlainText(block) }));
      if (blocks.length) {
        event.preventDefault();
        syncSelection({
          anchor: { blockId: blocks[0].id, offset: 0 },
          focus: { blockId: blocks[blocks.length - 1].id, offset: blocks[blocks.length - 1].text.length },
        });
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey ? engine.redo() : engine.undo()) {
        const next = engine.getSelection();
        setSelection(next ?? null);
        const restoredDocument = engine.getDocument();
        refreshActiveCell(restoredDocument);
        setActiveCellStoredMarks(null);
        onDocumentChange(restoredDocument);
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      if (engine.redo()) {
        setSelection(engine.getSelection() ?? null);
        const restoredDocument = engine.getDocument();
        refreshActiveCell(restoredDocument);
        setActiveCellStoredMarks(null);
        onDocumentChange(restoredDocument);
      }
      return;
    }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
      const current = engine.getSelection();
      if (!current) return;
      const blocks = collectTextBlocks(engine.getDocument().content);
      const focusIndex = blocks.findIndex(block => block.id === current.focus.blockId);
      if (focusIndex < 0) return;
      const block = blocks[focusIndex];
      if ((event.ctrlKey || event.metaKey) && (event.key === "Home" || event.key === "End")) {
        event.preventDefault();
        const targetBlock = event.key === "Home" ? blocks[0] : blocks[blocks.length - 1];
        if (!targetBlock) return;
        const focus = { blockId: targetBlock.id, offset: event.key === "Home" ? 0 : targetBlock.text.length };
        syncSelection(event.shiftKey ? { anchor: current.anchor, focus } : collapsedAt(focus));
        return;
      }
      const samePosition = current.anchor.blockId === current.focus.blockId && current.anchor.offset === current.focus.offset;
      const hasRange = !samePosition;
      const backwards = event.key === "ArrowLeft";
      let nextBlock = block;
      let offset = current.focus.offset;

      if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && hasRange && !event.shiftKey) {
        const anchorBlockIndex = blocks.findIndex(item => item.id === current.anchor.blockId);
        const ordered = anchorBlockIndex < focusIndex ||
          (anchorBlockIndex === focusIndex && current.anchor.offset <= current.focus.offset);
        const start = ordered ? current.anchor : current.focus;
        const end = ordered ? current.focus : current.anchor;
        event.preventDefault();
        syncSelection(collapsedAt(backwards ? start : end));
        return;
      }

      if ((event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "Home" || event.key === "End") && layout) {
        const allVisualLines: Array<{ pageIndex: number; blockId: string; line: import("../../../packages/engine/src/layout/layout").LayoutLine }> = [];
        layout.pages.forEach(page => collectLayoutLines(page.blocks, null, allVisualLines, page.index));
        // Table-cell lines have their own active-cell controller and flattened offsets.
        // Exclude them here so document-level navigation never applies a cell offset
        // to an unrelated paragraph when crossing a table boundary.
        const editableBlockIds = new Set(blocks.map(item => item.id));
        const visualLines = allVisualLines.filter(item => editableBlockIds.has(item.blockId));
        if (visualLines.length) {
          const movingUp = event.key === "ArrowUp";
          let lineIndex = visualLines.findIndex(item =>
            item.blockId === current.focus.blockId &&
            (movingUp
              ? current.focus.offset >= item.line.startOffset && current.focus.offset < item.line.endOffset
              : current.focus.offset > item.line.startOffset && current.focus.offset <= item.line.endOffset)
          );
          if (lineIndex < 0) lineIndex = visualLines.findIndex(item => item.blockId === current.focus.blockId && item.line.endOffset >= current.focus.offset);
          if (lineIndex < 0) lineIndex = visualLines.findIndex(item => item.blockId === current.focus.blockId);
          const currentLine = lineIndex >= 0 ? visualLines[lineIndex].line : undefined;
          if (currentLine && (event.key === "Home" || event.key === "End")) {
            offset = event.key === "Home" ? currentLine.startOffset : currentLine.endOffset;
          } else if (currentLine) {
            const targetLineIndex = lineIndex + (event.key === "ArrowUp" ? -1 : 1);
            if (targetLineIndex >= 0 && targetLineIndex < visualLines.length) {
              const target = visualLines[targetLineIndex];
              const measure = createLayoutTextMeasurer();
              const x = preferredVerticalX.current ?? getLineXAtOffset(currentLine, current.focus.offset, measure);
              preferredVerticalX.current = x;
              nextBlock = blocks.find(item => item.id === target.blockId) ?? block;
              offset = nearestGraphemeOffset(nextBlock.text, getOffsetAtLineX(target.line, x, measure));
            } else if (event.key === "ArrowUp" && focusIndex > 0) {
              nextBlock = blocks[focusIndex - 1];
              offset = nextBlock.text.length;
            } else if (event.key === "ArrowDown" && focusIndex < blocks.length - 1) {
              nextBlock = blocks[focusIndex + 1];
              offset = 0;
            }
          }
          event.preventDefault();
          const focus = { blockId: nextBlock.id, offset };
          syncSelection(event.shiftKey ? { anchor: current.anchor, focus } : collapsedAt(focus));
          return;
        }
      }

      if (event.key === "Home") offset = 0;
      else if (event.key === "End") offset = block.text.length;
      else if (backwards) {
        if (offset > 0) offset = previousCodePointOffset(block.text, offset);
        else if (focusIndex > 0) {
          nextBlock = blocks[focusIndex - 1];
          offset = nextBlock.text.length;
        }
      } else if (event.key === "ArrowRight") {
        if (offset < block.text.length) offset = nextCodePointOffset(block.text, offset);
        else if (focusIndex < blocks.length - 1) {
          nextBlock = blocks[focusIndex + 1];
          offset = 0;
        }
      }
      event.preventDefault();
      const focus = { blockId: nextBlock.id, offset };
      syncSelection(event.shiftKey ? { anchor: current.anchor, focus } : collapsedAt(focus));
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      const current = engine.getSelection();
      if (!current) return;
      const blocks = collectTextBlocks(engine.getDocument().content);
      if (current.anchor.blockId !== current.focus.blockId) {
        const anchorIndex = blocks.findIndex(item => item.id === current.anchor.blockId);
        const focusIndex = blocks.findIndex(item => item.id === current.focus.blockId);
        if (anchorIndex < 0 || focusIndex < 0) {
          onStatus?.("A seleção atual não corresponde a blocos editáveis.");
          return;
        }
        const firstIndex = Math.min(anchorIndex, focusIndex);
        const lastIndex = Math.max(anchorIndex, focusIndex);
        const first = blocks[firstIndex];
        const last = blocks[lastIndex];
        const start = anchorIndex < focusIndex ? current.anchor.offset : current.focus.offset;
        const end = anchorIndex < focusIndex ? current.focus.offset : current.anchor.offset;
        const commands = [
          deleteText({ blockId: first.id, start, end: first.text.length }),
          ...blocks.slice(firstIndex + 1, lastIndex).map(item => deleteText({ blockId: item.id, start: 0, end: item.text.length })),
          deleteText({ blockId: last.id, start: 0, end }),
          ...blocks.slice(firstIndex + 1, lastIndex + 1).map(item => mergeBlockWithPrevious({ blockId: item.id })),
        ];
        const result = engine.exec(commands, { group: "structural" });
        if (!result.ok) { onStatus?.("Não foi possível excluir entre esses blocos: " + result.error.message); return; }
        setSelection(engine.getSelection() ?? null);
        onDocumentChange(result.value.document);
        return;
      }
      const block = findBlock(engine.getDocument().content, current.focus.blockId);
      if (!block) return;
      let start = Math.min(current.anchor.offset, current.focus.offset);
      let end = Math.max(current.anchor.offset, current.focus.offset);
      if (start === end && event.key === "Backspace" && start === 0) {
        const index = blocks.findIndex(item => item.id === block.id);
        if (index <= 0) return;
        const result = engine.exec([mergeBlockWithPrevious({ blockId: block.id })], { group: "typing" });
        if (!result.ok) { onStatus?.(result.error.message); return; }
        setSelection(engine.getSelection() ?? null);
        onDocumentChange(result.value.document);
        return;
      }
      if (start === end && event.key === "Delete" && end === block.text.length) {
        const index = blocks.findIndex(item => item.id === block.id);
        if (index < 0 || index >= blocks.length - 1) return;
        const result = engine.exec([mergeBlockWithPrevious({ blockId: blocks[index + 1].id })], { group: "typing" });
        if (!result.ok) { onStatus?.(result.error.message); return; }
        setSelection(engine.getSelection() ?? null);
        onDocumentChange(result.value.document);
        return;
      }
      if (start === end) {
        if (event.key === "Backspace") start = event.ctrlKey || event.metaKey ? previousWordOffset(block.text, start) : previousCodePointOffset(block.text, start);
        else end = event.ctrlKey || event.metaKey ? nextWordOffset(block.text, end) : nextCodePointOffset(block.text, end);
      }
      if (start === end) return;
      const result = engine.exec([deleteText({ blockId: block.id, start, end })], { group: "typing" });
      if (!result.ok) { onStatus?.(result.error.message); return; }
      setSelection(result.value.selection ?? null);
      onDocumentChange(result.value.document);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const current = engine.getSelection();
      if (!current || current.anchor.blockId !== current.focus.blockId) {
        onStatus?.("Enter exige uma seleção dentro de um único parágrafo no SmartCanvas.");
        return;
      }
      const block = findBlock(engine.getDocument().content, current.focus.blockId);
      if (!block) return;
      const start = Math.min(current.anchor.offset, current.focus.offset);
      const end = Math.max(current.anchor.offset, current.focus.offset);
      const commands = [];
      if (start !== end) commands.push(replaceRange({ blockId: block.id, start, end, text: "" }));
      commands.push(splitBlock({ blockId: block.id, offset: start }));
      const result = engine.exec(commands, { group: "typing" });
      if (!result.ok) { onStatus?.(result.error.message); return; }
      setSelection(engine.getSelection() ?? null);
      onDocumentChange(result.value.document);
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      onStatus?.("Para navegar em uma tabela, selecione uma célula e use Tab ou Shift+Tab.");
    }
  };
  return <section className="kz-smartcanvas-experiment" aria-label="Prévia experimental SmartCanvas" style={{ margin: "0 0 16px", padding: 16, border: "1px solid #93c5fd", borderRadius: 12, background: "rgba(59,130,246,.04)", position: "relative", outline: trackChangesActive ? "2px dashed #d97706" : undefined, outlineOffset: trackChangesActive ? 3 : undefined }} onPointerDownCapture={event => { if ((event.target as HTMLElement).closest("input, button, textarea, select")) return; inputRef.current?.focus({ preventScroll: true }); }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
      <div><strong>SmartCanvas — prévia experimental</strong><div style={{ fontSize: 12, opacity: .75 }}>Edição por comandos do motor: texto, seleção lógica, tabelas e objetos. O editor legado permanece disponível durante a validação.</div></div>
      <span style={{ fontSize: 12 }}>{layout ? layout.pageCount + " página(s)" : "Layout indisponível"}</span>
    </div>
    <details style={{ marginBottom: 10, border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", background: "#fff" }}>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>Cabeçalho e rodapé</summary>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 10 }}>
        <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
          <span>Cabeçalho</span>
          <input aria-label="Texto do cabeçalho SmartCanvas" value={headerText} maxLength={2000} disabled={readOnly || !onHeaderTextChange} onChange={event => onHeaderTextChange?.(event.currentTarget.value)} placeholder="Texto do cabeçalho" style={{ minWidth: 0, padding: "7px 8px", border: "1px solid #cbd5e1", borderRadius: 6 }} />
          <select aria-label="Alinhamento do cabeçalho SmartCanvas" value={headerAlign} disabled={readOnly || !onHeaderAlignChange} onChange={event => onHeaderAlignChange?.(event.currentTarget.value as "left" | "center" | "right")} style={{ padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: 6 }}>
            <option value="left">À esquerda</option><option value="center">Centralizado</option><option value="right">À direita</option>
          </select>
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
          <span>Rodapé</span>
          <input aria-label="Texto do rodapé SmartCanvas" value={footerText} maxLength={2000} disabled={readOnly || !onFooterTextChange} onChange={event => onFooterTextChange?.(event.currentTarget.value)} placeholder="Texto do rodapé" style={{ minWidth: 0, padding: "7px 8px", border: "1px solid #cbd5e1", borderRadius: 6 }} />
          <select aria-label="Alinhamento do rodapé SmartCanvas" value={footerAlign} disabled={readOnly || !onFooterAlignChange} onChange={event => onFooterAlignChange?.(event.currentTarget.value as "left" | "center" | "right")} style={{ padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: 6 }}>
            <option value="left">À esquerda</option><option value="center">Centralizado</option><option value="right">À direita</option>
          </select>
        </label>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12 }}>
        <input aria-label="Mostrar números de página SmartCanvas" type="checkbox" checked={showPageNumbers} disabled={readOnly || !onShowPageNumbersChange} onChange={event => onShowPageNumbersChange?.(event.currentTarget.checked)} />
        Mostrar números de página
      </label>
    </details>
    {activeCell ? <div role="group" aria-label="Estrutura da tabela SmartCanvas" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
      <button type="button" disabled={readOnly} onMouseDown={event => event.preventDefault()} onClick={() => mutateActiveTable("add-row")} aria-label="Adicionar linha SmartCanvas">Adicionar linha</button>
      <button type="button" disabled={readOnly} onMouseDown={event => event.preventDefault()} onClick={() => mutateActiveTable("add-column")} aria-label="Adicionar coluna SmartCanvas">Adicionar coluna</button>
      <button type="button" disabled={readOnly} onMouseDown={event => event.preventDefault()} onClick={() => mutateActiveTable("remove-row")} aria-label="Remover linha SmartCanvas">Remover linha</button>
      <button type="button" disabled={readOnly} onMouseDown={event => event.preventDefault()} onClick={() => mutateActiveTable("remove-column")} aria-label="Remover coluna SmartCanvas">Remover coluna</button>
    </div> : null}
    <div role="toolbar" aria-label="Formatação SmartCanvas" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
      <button type="button" disabled={readOnly} onMouseDown={event => event.preventDefault()} onClick={() => applySmartCanvasMark({ type: "bold" })} aria-label="Negrito SmartCanvas" title="Negrito (Ctrl+B)" style={{ padding: "6px 9px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff", fontWeight: 700 }}>B</button>
      <button type="button" disabled={readOnly} onMouseDown={event => event.preventDefault()} onClick={() => applySmartCanvasMark({ type: "italic" })} aria-label="Itálico SmartCanvas" title="Itálico (Ctrl+I)" style={{ padding: "6px 9px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff", fontStyle: "italic" }}>I</button>
      <button type="button" disabled={readOnly} onMouseDown={event => event.preventDefault()} onClick={() => applySmartCanvasMark({ type: "underline" })} aria-label="Sublinhado SmartCanvas" title="Sublinhado (Ctrl+U)" style={{ padding: "6px 9px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff", textDecoration: "underline" }}>U</button>
      <button type="button" disabled={readOnly} onMouseDown={event => event.preventDefault()} onClick={() => applySmartCanvasMark({ type: "strike" })} aria-label="Tachado SmartCanvas" title="Tachado" style={{ padding: "6px 9px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff", textDecoration: "line-through" }}>S</button>
      <button type="button" disabled={readOnly} onMouseDown={event => event.preventDefault()} onClick={() => applySmartCanvasMark({ type: "superscript" })} aria-label="Sobrescrito SmartCanvas" title="Sobrescrito" style={{ padding: "6px 9px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff" }}>x²</button>
      <button type="button" disabled={readOnly} onMouseDown={event => event.preventDefault()} onClick={() => applySmartCanvasMark({ type: "subscript" })} aria-label="Subscrito SmartCanvas" title="Subscrito" style={{ padding: "6px 9px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff" }}>x₂</button>
      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
        <span>Estilo</span>
        <select aria-label="Nível de título SmartCanvas" value={headingLevelDraft} disabled={readOnly} onChange={event => setHeadingLevelDraft(event.currentTarget.value)} style={{ padding: "5px 6px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff" }}>
          <option value="paragraph">Parágrafo</option>
          <option value="1">Título 1</option>
          <option value="2">Título 2</option>
          <option value="3">Título 3</option>
          <option value="4">Título 4</option>
          <option value="5">Título 5</option>
          <option value="6">Título 6</option>
        </select>
        <button type="button" disabled={readOnly} onMouseDown={event => event.preventDefault()} onClick={applySmartCanvasHeading} aria-label="Aplicar estilo de bloco SmartCanvas">Aplicar</button>
      </label>
      <button type="button" disabled={readOnly} onMouseDown={event => event.preventDefault()} onClick={convertSmartCanvasBlockquote} aria-label="Citação em bloco SmartCanvas">Citação</button>
      <button type="button" disabled={readOnly} onMouseDown={event => event.preventDefault()} onClick={() => insertSmartCanvasBreak("page")} aria-label="Inserir quebra de página SmartCanvas">Quebra de página</button>
      <button type="button" disabled={readOnly} onMouseDown={event => event.preventDefault()} onClick={() => insertSmartCanvasBreak("rule")} aria-label="Inserir linha horizontal SmartCanvas">Linha</button>
      <button type="button" disabled={readOnly} onMouseDown={event => event.preventDefault()} onClick={() => convertSmartCanvasList(false)} aria-label="Lista com marcadores SmartCanvas" title="Lista com marcadores" style={{ padding: "6px 9px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff" }}>• Lista</button>
      <button type="button" disabled={readOnly} onMouseDown={event => event.preventDefault()} onClick={() => convertSmartCanvasList(true)} aria-label="Lista numerada SmartCanvas" title="Lista numerada" style={{ padding: "6px 9px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff" }}>1. Lista</button>
      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }} title="Tamanho da fonte">
        <span>Fonte</span>
        <select aria-label="Tamanho de fonte SmartCanvas" value={fontSizeDraft} disabled={readOnly} onChange={event => setFontSizeDraft(event.currentTarget.value)} style={{ padding: "5px 6px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff" }}>
          {["8", "9", "10", "11", "12", "14", "16", "18", "24", "36", "48"].map(size => <option key={size} value={size}>{size}</option>)}
        </select>
        <button type="button" disabled={readOnly} onMouseDown={event => event.preventDefault()} onClick={() => applySmartCanvasMark({ type: "fontSize", value: Number(fontSizeDraft) })} aria-label="Aplicar tamanho de fonte SmartCanvas" style={{ padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff" }}>Aplicar</button>
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }} title="Família tipográfica">
        <span>Tipo</span>
        <select aria-label="Família de fonte SmartCanvas" value={fontFamilyDraft} disabled={readOnly} onChange={event => setFontFamilyDraft(event.currentTarget.value)} style={{ padding: "5px 6px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff" }}>
          {["Arial", "Georgia", "Times New Roman", "Courier New", "Verdana"].map(family => <option key={family} value={family}>{family}</option>)}
        </select>
        <button type="button" disabled={readOnly} onMouseDown={event => event.preventDefault()} onClick={() => applySmartCanvasMark({ type: "fontFamily", value: fontFamilyDraft })} aria-label="Aplicar família de fonte SmartCanvas" style={{ padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff" }}>Aplicar</button>
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }} title="Cor do texto">
        <span>Cor</span>
        <input aria-label="Cor do texto SmartCanvas" type="color" value={textColorDraft} disabled={readOnly} onChange={event => setTextColorDraft(event.currentTarget.value)} />
        <button type="button" disabled={readOnly} onMouseDown={event => event.preventDefault()} onClick={() => applySmartCanvasMark({ type: "color", value: textColorDraft })} aria-label="Aplicar cor do texto SmartCanvas" style={{ padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff" }}>Aplicar</button>
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }} title="Realce do texto">
        <span>Realce</span>
        <input aria-label="Cor de realce SmartCanvas" type="color" value={highlightDraft} disabled={readOnly} onChange={event => setHighlightDraft(event.currentTarget.value)} />
        <button type="button" disabled={readOnly} onMouseDown={event => event.preventDefault()} onClick={() => applySmartCanvasMark({ type: "highlight", value: highlightDraft })} aria-label="Aplicar realce SmartCanvas" style={{ padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff" }}>Aplicar</button>
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }} title="Inserir hiperligação">
        <span>Link</span>
        <input aria-label="URL do link SmartCanvas" type="url" value={linkDraft} disabled={readOnly} onChange={event => setLinkDraft(event.currentTarget.value)} placeholder="https://…" style={{ width: 150, padding: "5px 6px", border: "1px solid #cbd5e1", borderRadius: 6 }} />
        <button type="button" disabled={readOnly} onMouseDown={event => event.preventDefault()} onClick={applySmartCanvasLink} aria-label="Aplicar link SmartCanvas" style={{ padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff" }}>Aplicar</button>
      </label>
      <button type="button" disabled={readOnly} onMouseDown={event => event.preventDefault()} onClick={() => imageFileInputRef.current?.click()} aria-label="Inserir imagem de arquivo SmartCanvas">Inserir imagem</button>
      <input ref={imageFileInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" aria-label="Arquivo de imagem SmartCanvas" disabled={readOnly} style={{ display: "none" }} onChange={event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (file) insertSmartCanvasImageFile(file);
      }} />
      <button type="button" disabled={readOnly} onMouseDown={event => event.preventDefault()} onClick={insertSmartCanvasTable} aria-label="Inserir tabela SmartCanvas" title="Inserir tabela 3×3" style={{ padding: "6px 9px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff" }}>▦ Tabela</button>
      <span aria-hidden="true" style={{ width: 1, height: 24, background: "#cbd5e1", margin: "0 3px" }} />
      <button type="button" disabled={readOnly} onMouseDown={event => event.preventDefault()} onClick={() => applySmartCanvasAlignment("start")} aria-label="Alinhar à esquerda SmartCanvas" title="Alinhar à esquerda" style={{ padding: "6px 9px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff" }}>⇤</button>
      <button type="button" disabled={readOnly} onMouseDown={event => event.preventDefault()} onClick={() => applySmartCanvasAlignment("center")} aria-label="Centralizar SmartCanvas" title="Centralizar" style={{ padding: "6px 9px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff" }}>↔</button>
      <button type="button" disabled={readOnly} onMouseDown={event => event.preventDefault()} onClick={() => applySmartCanvasAlignment("end")} aria-label="Alinhar à direita SmartCanvas" title="Alinhar à direita" style={{ padding: "6px 9px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff" }}>⇥</button>
      <button type="button" disabled={readOnly} onMouseDown={event => event.preventDefault()} onClick={() => applySmartCanvasAlignment("justify")} aria-label="Justificar SmartCanvas" title="Justificar" style={{ padding: "6px 9px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff" }}>☷</button>
      <button type="button" disabled={readOnly} onMouseDown={event => event.preventDefault()} onClick={() => applySmartCanvasIndent("decrease")} aria-label="Diminuir recuo SmartCanvas" title="Diminuir recuo" style={{ padding: "6px 9px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff" }}>⇤−</button>
      <button type="button" disabled={readOnly} onMouseDown={event => event.preventDefault()} onClick={() => applySmartCanvasIndent("increase")} aria-label="Aumentar recuo SmartCanvas" title="Aumentar recuo" style={{ padding: "6px 9px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff" }}>⇥+</button>
      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
        <span>Entrelinha</span>
        <select aria-label="Entrelinha SmartCanvas" value={lineSpacingDraft} disabled={readOnly} onChange={event => setLineSpacingDraft(event.currentTarget.value)} style={{ padding: "5px 6px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff" }}>
          {["0.5", "0.75", "1", "1.15", "1.2", "1.5", "2", "2.5", "3", "4"].map(value => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
        <span>Espaço após (pt)</span>
        <input aria-label="Espaçamento após SmartCanvas" type="number" min={0} max={720} value={spacingAfterDraft} disabled={readOnly} onChange={event => setSpacingAfterDraft(event.currentTarget.value)} style={{ width: 70, padding: "5px 6px", border: "1px solid #cbd5e1", borderRadius: 6 }} />
      </label>
      <button type="button" disabled={readOnly} onMouseDown={event => event.preventDefault()} onClick={applySmartCanvasParagraphSpacing} aria-label="Aplicar espaçamento SmartCanvas" style={{ padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff" }}>Aplicar</button>
    </div>
    {activeBlockId && findDocumentNode(document.content, activeBlockId)?.type === "image" ? <div role="group" aria-label="Propriedades da imagem selecionada" style={{ display: "flex", alignItems: "end", gap: 8, flexWrap: "wrap", marginBottom: 10, padding: 10, border: "1px solid #bfdbfe", borderRadius: 8, background: "#eff6ff" }}>
      <label style={{ display: "grid", gap: 4, fontSize: 12 }}>Texto alternativo
        <input aria-label="Texto alternativo da imagem" maxLength={2000} value={imageAltDraft} disabled={readOnly} onChange={event => setImageAltDraft(event.currentTarget.value)} style={{ minWidth: 180, padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: 6 }} />
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 12 }}>Largura (px)
        <input aria-label="Largura da imagem em pixels" type="number" min={1} max={2000} value={imageWidthDraft} disabled={readOnly} onChange={event => setImageWidthDraft(event.currentTarget.value)} placeholder="Automática" style={{ width: 110, padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: 6 }} />
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 12 }}>Altura (px)
        <input aria-label="Altura da imagem em pixels" type="number" min={1} max={2000} value={imageHeightDraft} disabled={readOnly} onChange={event => setImageHeightDraft(event.currentTarget.value)} placeholder="Automática" style={{ width: 110, padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: 6 }} />
      </label>
      <button type="button" disabled={readOnly} onClick={applySelectedImageProperties} style={{ padding: "7px 12px", border: "1px solid #2563eb", borderRadius: 6, background: "#2563eb", color: "#fff", cursor: readOnly ? "not-allowed" : "pointer" }}>Aplicar</button>
    </div> : null}
    {activeBlockId && findDocumentNode(document.content, activeBlockId)?.editorObject ? <div role="group" aria-label="Propriedades do objeto selecionado" style={{ display: "flex", alignItems: "end", gap: 8, flexWrap: "wrap", marginBottom: 10, padding: 10, border: "1px solid #bfdbfe", borderRadius: 8, background: "#eff6ff" }}>
      <label style={{ display: "grid", gap: 4, fontSize: 12 }}>Rótulo do objeto
        <input aria-label="Rótulo do objeto" maxLength={200} value={objectLabelDraft} disabled={readOnly} onChange={event => setObjectLabelDraft(event.currentTarget.value)} onInput={event => setObjectLabelDraft(event.currentTarget.value)} style={{ minWidth: 150, padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: 6 }} />
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 12 }}>Largura (pt)
        <input aria-label="Largura do objeto em pontos" type="text" inputMode="numeric" min={1} max={2000} value={objectWidthDraft} disabled={readOnly} onChange={event => setObjectWidthDraft(event.currentTarget.value)} onInput={event => setObjectWidthDraft(event.currentTarget.value)} style={{ width: 100, padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: 6 }} />
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 12 }}>Altura (pt)
        <input aria-label="Altura do objeto em pontos" type="text" inputMode="numeric" min={1} max={2000} value={objectHeightDraft} disabled={readOnly} onChange={event => setObjectHeightDraft(event.currentTarget.value)} onInput={event => setObjectHeightDraft(event.currentTarget.value)} style={{ width: 100, padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: 6 }} />
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 12 }}>Preenchimento
        <input aria-label="Preenchimento do objeto" type="color" value={objectFillDraft} disabled={readOnly} onChange={event => setObjectFillDraft(event.currentTarget.value)} />
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 12 }}>Contorno
        <input aria-label="Contorno do objeto" type="color" value={objectStrokeDraft} disabled={readOnly} onChange={event => setObjectStrokeDraft(event.currentTarget.value)} />
      </label>
      <button type="button" disabled={readOnly} onClick={applySelectedObjectProperties} style={{ padding: "7px 12px", border: "1px solid #2563eb", borderRadius: 6, background: "#2563eb", color: "#fff", cursor: readOnly ? "not-allowed" : "pointer" }}>Aplicar</button>
      <button type="button" disabled={readOnly} onClick={() => moveSelectedObject("up")} style={{ padding: "7px 12px", border: "1px solid #94a3b8", borderRadius: 6, background: "#fff", cursor: readOnly ? "not-allowed" : "pointer" }}>Mover para cima</button>
      <button type="button" disabled={readOnly} onClick={() => moveSelectedObject("down")} style={{ padding: "7px 12px", border: "1px solid #94a3b8", borderRadius: 6, background: "#fff", cursor: readOnly ? "not-allowed" : "pointer" }}>Mover para baixo</button>
    </div> : null}
    <textarea ref={inputRef} disabled={readOnly} aria-label="Entrada de texto do SmartCanvas" autoCapitalize="off" autoComplete="off" spellCheck={spellcheckEnabled} defaultValue="" onChange={event => { if (composing.current) return; const value = event.currentTarget.value; if (lastCompositionValue.current !== null) { const repeatedComposition = value === lastCompositionValue.current; lastCompositionValue.current = null; if (repeatedComposition) { event.currentTarget.value = ""; return; } } handleInput(value); }} onKeyDown={handleKeyDown} onCopy={event => { if (activeCell) { const start = Math.min(activeCell.anchorOffset, activeCell.offset), end = Math.max(activeCell.anchorOffset, activeCell.offset); if (start === end) return; event.clipboardData.setData("text/plain", activeCell.text.slice(start, end)); event.preventDefault(); return; } const current = engine.getSelection(); if (!current || (current.anchor.blockId === current.focus.blockId && current.anchor.offset === current.focus.offset)) return; event.clipboardData.setData("text/plain", getSelectedText(engine.getDocument().content, current)); event.preventDefault(); }} onCut={event => { if (readOnly) { event.preventDefault(); return; } if (activeCell) { const start = Math.min(activeCell.anchorOffset, activeCell.offset), end = Math.max(activeCell.anchorOffset, activeCell.offset); if (start === end) return; event.clipboardData.setData("text/plain", activeCell.text.slice(start, end)); event.preventDefault(); commitCellText(activeCell.text.slice(0, start) + activeCell.text.slice(end), start); return; } const current = engine.getSelection(); if (!current || (current.anchor.blockId === current.focus.blockId && current.anchor.offset === current.focus.offset)) return; event.clipboardData.setData("text/plain", getSelectedText(engine.getDocument().content, current)); event.preventDefault(); if (current.anchor.blockId !== current.focus.blockId) { const documentContent = engine.getDocument().content; const ranges = getSmartCanvasTextSelectionRanges(documentContent, current); if (!ranges) { onStatus?.("O texto foi copiado, mas não foi removido porque a seleção inclui um bloco não editável."); return; } const topLevelTextOnly = ranges.every(range => documentContent.some(block => (block.type === "paragraph" || block.type === "heading") && block.id === range.block.id)); if (!topLevelTextOnly) { const commands = ranges.filter(range => range.end > range.start).map(range => deleteText({ blockId: range.block.id, start: range.start, end: range.end })); const result = engine.exec(commands, { group: "structural" }); if (!result.ok) { onStatus?.("O texto foi copiado, mas não foi possível removê-lo: " + result.error.message); return; } setSelection(engine.getSelection() ?? null); onDocumentChange(result.value.document); onStatus?.("Texto recortado; os contêineres de lista e tabela foram preservados."); return; } const blocks = ranges.map(range => ({ id: range.block.id, text: getPlainText(range.block) })); const anchorIndex = blocks.findIndex(item => item.id === current.anchor.blockId), focusIndex = blocks.findIndex(item => item.id === current.focus.blockId); const firstIndex = Math.min(anchorIndex, focusIndex), lastIndex = Math.max(anchorIndex, focusIndex); const first = blocks[firstIndex], last = blocks[lastIndex]; const start = anchorIndex < focusIndex ? current.anchor.offset : current.focus.offset, end = anchorIndex < focusIndex ? current.focus.offset : current.anchor.offset; const commands = [deleteText({ blockId: first.id, start, end: first.text.length }), ...blocks.slice(firstIndex + 1, lastIndex).map(item => deleteText({ blockId: item.id, start: 0, end: item.text.length })), deleteText({ blockId: last.id, start: 0, end }), ...blocks.slice(firstIndex + 1, lastIndex + 1).map(item => mergeBlockWithPrevious({ blockId: item.id }))]; const result = engine.exec(commands, { group: "structural" }); if (!result.ok) { onStatus?.("O texto foi copiado, mas não foi possível removê-lo: " + result.error.message); return; } setSelection(engine.getSelection() ?? null); onDocumentChange(result.value.document); return; } const block = findBlock(engine.getDocument().content, current.focus.blockId); if (!block) return; const start = Math.min(current.anchor.offset, current.focus.offset), end = Math.max(current.anchor.offset, current.focus.offset); const result = engine.exec([deleteText({ blockId: block.id, start, end })], { group: "typing" }); if (result.ok) { setSelection(result.value.selection ?? null); onDocumentChange(result.value.document); } }} onPaste={event => {
      if (readOnly) { event.preventDefault(); return; }
      event.preventDefault();
      const clipboardImage = Array.from(event.clipboardData.items ?? [])
        .filter(item => item.kind === "file")
        .map(item => item.getAsFile())
        .find((file): file is File => !!file && /^image\/(?:png|jpeg|gif|webp)$/i.test(file.type))
        ?? Array.from(event.clipboardData.files ?? [])
          .find((file): file is File => /^image\/(?:png|jpeg|gif|webp)$/i.test(file.type));
      if (clipboardImage) {
        insertSmartCanvasImageFile(clipboardImage);
        return;
      }
      const richHtml = event.clipboardData.getData("text/html");
      const current = engine.getSelection();
      if (activeCell && richHtml) {
        try {
          const imported = nexusDocumentFromHtml(richHtml, engine.getDocument().metadata.title);
          const paragraphBlocks = imported.content.filter(block => block.type === "paragraph" || block.type === "heading");
          if (paragraphBlocks.length === imported.content.length && paragraphBlocks.length > 0) {
            const insertionRuns: Array<{ text: string; marks: Mark[] }> = [];
            paragraphBlocks.forEach((block, index) => {
              if (block.type !== "paragraph" && block.type !== "heading") return;
              for (const run of block.children) {
                if (run.text) insertionRuns.push({ text: run.text, marks: run.marks.map(mark => ({ ...mark })) });
              }
              if (index < paragraphBlocks.length - 1) insertionRuns.push({ text: "\n", marks: [] });
            });
            const pastedText = insertionRuns.map(run => run.text).join("");
            if (pastedText) {
              const start = Math.min(activeCell.anchorOffset, activeCell.offset);
              const end = Math.max(activeCell.anchorOffset, activeCell.offset);
              const nextText = activeCell.text.slice(0, start) + pastedText + activeCell.text.slice(end);
              const result = engine.exec([setCellText({
                tableId: activeCell.tableId,
                rowId: activeCell.rowId,
                cellId: activeCell.cellId,
                text: nextText,
                insertionRange: { start, end: start + pastedText.length },
                insertionRuns,
              })], { group: "typing" });
              if (!result.ok) {
                onStatus?.("A colagem formatada na célula não pôde ser aplicada: " + result.error.message);
                handleInput(event.clipboardData.getData("text/plain"));
                return;
              }
              setActiveCell({ ...activeCell, text: nextText, anchorOffset: start + pastedText.length, offset: start + pastedText.length });
              setActiveCellStoredMarks(null);
              onDocumentChange(result.value.document);
              onStatus?.("Conteúdo formatado colado na célula com sanitização.");
              return;
            }
          }
          // Table cells currently store paragraphs plus anchored images, not
          // nested list/table nodes. Preserve rich structures as readable cell
          // text and import embedded images as first-class cell image resources.
          const pastedImages: PastedCellImage[] = [];
          const pastedLines = flattenPastedCellContent(imported.content, pastedImages);
          const insertionRuns: PastedCellTextRun[] = [];
          pastedLines.forEach((line, index) => {
            if (index > 0) insertionRuns.push({ text: "\n", marks: [] });
            insertionRuns.push(...line);
          });
          const pastedText = insertionRuns.map(run => run.text).join("");
          const start = Math.min(activeCell.anchorOffset, activeCell.offset);
          const end = Math.max(activeCell.anchorOffset, activeCell.offset);
          const nextText = activeCell.text.slice(0, start) + pastedText + activeCell.text.slice(end);
          const commands = [];
          if (pastedText) {
            commands.push(setCellText({
              tableId: activeCell.tableId,
              rowId: activeCell.rowId,
              cellId: activeCell.cellId,
              text: nextText,
              insertionRange: { start, end: start + pastedText.length },
              insertionRuns,
            }));
          }
          for (const image of pastedImages) {
            const resource = imported.resources.find(item => item.id === image.resourceId && item.kind === "image");
            if (!resource) continue;
            commands.push(insertTableCellImageResource({
              tableId: activeCell.tableId,
              rowId: activeCell.rowId,
              cellId: activeCell.cellId,
              mimeType: resource.mimeType,
              data: resource.data,
              alt: image.alt,
              name: resource.name,
              width: image.width,
              height: image.height,
            }));
          }
          if (commands.length) {
            const result = engine.exec(commands, { group: "structural" });
            if (!result.ok) {
              onStatus?.("A colagem estruturada na célula não pôde ser aplicada: " + result.error.message);
              handleInput(event.clipboardData.getData("text/plain"));
              return;
            }
            if (pastedText) setActiveCell({ ...activeCell, text: nextText, anchorOffset: start + pastedText.length, offset: start + pastedText.length });
            setActiveCellStoredMarks(null);
            onDocumentChange(result.value.document);
            onStatus?.(pastedImages.length
              ? "Conteúdo colado na célula; listas e tabelas foram convertidas em texto e imagens foram incorporadas."
              : "Listas e tabelas coladas na célula foram convertidas em texto estruturado.");
            return;
          }
        } catch {
          onStatus?.("A colagem formatada na célula não pôde ser interpretada; foi usado texto simples.");
        }
      }
      if (!activeCell && richHtml && current) {
        try {
          const documentNow = engine.getDocument();
          const imported = nexusDocumentFromHtml(richHtml, documentNow.metadata.title);
          if (current.anchor.blockId === current.focus.blockId) {
            const source = documentNow.content.find(block => block.id === current.focus.blockId);
            if (source && (source.type === "paragraph" || source.type === "heading")) {
              const result = engine.exec([insertImportedBlocksAtSelection({
                blockId: source.id,
                start: Math.min(current.anchor.offset, current.focus.offset),
                end: Math.max(current.anchor.offset, current.focus.offset),
                blocks: imported.content,
                resources: imported.resources,
              })], { group: "structural" });
              if (!result.ok) {
                onStatus?.("A colagem formatada não pôde ser aplicada: " + result.error.message);
                handleInput(event.clipboardData.getData("text/plain"));
                return;
              }
              syncSelection(result.value.selection ?? engine.getSelection());
              onDocumentChange(result.value.document);
              onStatus?.("Conteúdo formatado colado com sanitização.");
              return;
            }
          } else {
            const textBlocks = collectTextBlocks(documentNow.content);
            const anchorIndex = textBlocks.findIndex(block => block.id === current.anchor.blockId);
            const focusIndex = textBlocks.findIndex(block => block.id === current.focus.blockId);
            if (anchorIndex >= 0 && focusIndex >= 0) {
              const firstIndex = Math.min(anchorIndex, focusIndex);
              const lastIndex = Math.max(anchorIndex, focusIndex);
              const first = textBlocks[firstIndex]!;
              const last = textBlocks[lastIndex]!;
              const startOffset = anchorIndex < focusIndex ? current.anchor.offset : current.focus.offset;
              const endOffset = anchorIndex < focusIndex ? current.focus.offset : current.anchor.offset;
              const firstTopIndex = documentNow.content.findIndex(block => block.id === first.id);
              const lastTopIndex = documentNow.content.findIndex(block => block.id === last.id);
              const selectedTopLevel = firstTopIndex >= 0 && lastTopIndex >= firstTopIndex
                ? documentNow.content.slice(firstTopIndex, lastTopIndex + 1)
                : [];
              const supportedStructure = selectedTopLevel.length === lastIndex - firstIndex + 1 &&
                selectedTopLevel.every(block => block.type === "paragraph" || block.type === "heading");
              if (supportedStructure) {
                const commands = [];
                if (startOffset < first.text.length) commands.push(deleteText({ blockId: first.id, start: startOffset, end: first.text.length }));
                for (const block of textBlocks.slice(firstIndex + 1, lastIndex)) {
                  if (block.text.length) commands.push(deleteText({ blockId: block.id, start: 0, end: block.text.length }));
                }
                if (endOffset > 0) commands.push(deleteText({ blockId: last.id, start: 0, end: endOffset }));
                for (const block of textBlocks.slice(firstIndex + 1, lastIndex + 1)) {
                  commands.push(mergeBlockWithPrevious({ blockId: block.id }));
                }
                commands.push(insertImportedBlocksAtSelection({
                  blockId: first.id,
                  start: startOffset,
                  end: startOffset,
                  blocks: imported.content,
                  resources: imported.resources,
                }));
                const result = engine.exec(commands, { group: "structural" });
                if (!result.ok) {
                  onStatus?.("A colagem formatada entre blocos não pôde ser aplicada: " + result.error.message);
                  handleInput(event.clipboardData.getData("text/plain"));
                  return;
                }
                syncSelection(result.value.selection ?? engine.getSelection());
                onDocumentChange(result.value.document);
                onStatus?.("Conteúdo formatado colado sobre a seleção entre blocos.");
                return;
              }
            }
          }
        } catch {
          onStatus?.("A colagem formatada não pôde ser interpretada; foi usado texto simples.");
        }
      }
      handleInput(event.clipboardData.getData("text/plain"));
    }} onCompositionStart={() => { composing.current = true; lastCompositionValue.current = null; }} onCompositionEnd={event => { const value = event.currentTarget.value; composing.current = false; lastCompositionValue.current = value || null; handleInput(value); }} style={{ position: "absolute", width: 1, height: 1, opacity: 0, padding: 0, border: 0, overflow: "hidden", left: 0, bottom: 0, resize: "none" }} />
    {layout ? <div style={{ maxHeight: 560, overflow: "auto", background: "#e5e7eb", borderRadius: 8, zoom: `${Math.max(25, Math.min(300, zoom))}%` }}>
      <CanvasDocumentRenderer layout={layout} document={document} headerText={headerText} footerText={footerText} headerAlign={headerAlign} footerAlign={footerAlign} showPageNumbers={showPageNumbers} showFormattingMarks={showFormattingMarks} selection={selection || undefined} showCaret={!!selection && !activeCell} activeCellId={activeCell?.cellId} activeCellSelection={activeCell || undefined} activeBlockId={activeBlockId || undefined} onHitTest={handleHit} />
    </div> : <p role="status">Aguardando documento/layout do motor.</p>}
  </section>;
}

import { useMemo, useRef, useState } from "react";
import { addTableRow, collapsedAt, deleteBlock, deleteText, insertText, removeImage, updateImage, getLineXAtOffset, getOffsetAtLineX, getPlainText, layoutDocument, mergeBlockWithPrevious, replaceRange, setCellText, splitBlock, toggleMark as toggleMarkCommand, type Editor as NexusEngineSession, type Mark, type NexusDocument, type Selection, type SmartCanvasHitTarget } from "../../../packages/engine/src/index";
import { CanvasDocumentRenderer } from "./CanvasDocumentRenderer";
import { lineEndOffset, lineStartOffset, nearestGraphemeOffset, nextCodePointOffset, nextWordOffset, previousCodePointOffset, previousWordOffset, verticalLineOffset, wordRangeAt } from "./smartCanvasTextOffsets";

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

type DocumentNodeLike = { id?: string; type?: string; alt?: string; width?: number; height?: number; children?: unknown };

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

function getSelectedText(nodes: readonly unknown[], selection: Selection): string {
  const blocks = collectTextBlocks(nodes);
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

export function SmartCanvasPreview({ document, engine, headerText = "", footerText = "", headerAlign = "left", footerAlign = "left", showPageNumbers = false, readOnly = false, onDocumentChange, onStatus }: {
  document: NexusDocument;
  engine: NexusEngineSession;
  headerText?: string;
  footerText?: string;
  headerAlign?: "left" | "center" | "right";
  footerAlign?: "left" | "center" | "right";
  showPageNumbers?: boolean;
  readOnly?: boolean;
  onDocumentChange: (document: NexusDocument) => void;
  onStatus?: (message: string) => void;
}) {
  const [selection, setSelection] = useState<Selection | null>(engine.getSelection() ?? null);
  const [activeCell, setActiveCell] = useState<(EditableCell & { anchorOffset: number; offset: number }) | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [imageAltDraft, setImageAltDraft] = useState("");
  const [imageWidthDraft, setImageWidthDraft] = useState("");
  const [imageHeightDraft, setImageHeightDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const preferredVerticalX = useRef<number | null>(null);
  const preferredCellColumn = useRef<number | null>(null);
  const layout = useMemo(() => {
    try { return layoutDocument(document); }
    catch { return null; }
  }, [document]);
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
      setSelection(null);
      engine.setSelection(undefined);
      inputRef.current?.focus({ preventScroll: true });
      onStatus?.(selectedBlock?.type === "image"
        ? "Imagem selecionada. Edite o texto alternativo e as dimensões nos controles do SmartCanvas."
        : "Bloco " + target.blockId + " selecionado no SmartCanvas. A edição de texto está suspensa até que um bloco de texto seja selecionado.");
    }
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
  const commitText = (text: string) => {
    if (!text || readOnly) return;
    const current = engine.getSelection();
    if (current && current.anchor.blockId !== current.focus.blockId) {
      const blocks = collectTextBlocks(engine.getDocument().content);
      const anchorIndex = blocks.findIndex(block => block.id === current.anchor.blockId);
      const focusIndex = blocks.findIndex(block => block.id === current.focus.blockId);
      if (anchorIndex < 0 || focusIndex < 0) {
        onStatus?.("A seleção não corresponde a blocos de texto editáveis.");
        return;
      }
      const firstIndex = Math.min(anchorIndex, focusIndex);
      const lastIndex = Math.max(anchorIndex, focusIndex);
      const first = blocks[firstIndex];
      const last = blocks[lastIndex];
      const start = anchorIndex < focusIndex ? current.anchor.offset : current.focus.offset;
      const end = anchorIndex < focusIndex ? current.focus.offset : current.anchor.offset;
      const commands = [];
      if (start < first.text.length) commands.push(deleteText({ blockId: first.id, start, end: first.text.length }));
      for (const block of blocks.slice(firstIndex + 1, lastIndex)) {
        if (block.text.length) commands.push(deleteText({ blockId: block.id, start: 0, end: block.text.length }));
      }
      if (end > 0) commands.push(deleteText({ blockId: last.id, start: 0, end }));
      for (const block of blocks.slice(firstIndex + 1, lastIndex + 1)) commands.push(mergeBlockWithPrevious({ blockId: block.id }));
      commands.push(insertText({ blockId: first.id, offset: start, text, marks: marksAtTextOffset(engine.getDocument().content, first.id, start, engine) }));
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
    const result = engine.exec([setCellText({ tableId: activeCell.tableId, rowId: activeCell.rowId, cellId: activeCell.cellId, text: nextText })], { group: "typing" });
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
          onStatus?.("Selecione texto dentro da célula para aplicar a formatação.");
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
          onDocumentChange(result.value.document);
          onStatus?.("Nova linha adicionada à tabela.");
          return;
        }
        const nextIndex = event.shiftKey ? Math.max(0, index - 1) : Math.min(cells.length - 1, index + 1);
        const next = cells[nextIndex];
        if (next) {
          const offset = event.shiftKey ? next.text.length : 0;
          setActiveCell({ ...next, anchorOffset: offset, offset });
        }
        return;
      }
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        const lineStart = lineStartOffset(activeCell.text, activeCell.offset);
        if (preferredCellColumn.current === null) preferredCellColumn.current = activeCell.offset - lineStart;
        const offset = verticalLineOffset(activeCell.text, activeCell.offset, event.key === "ArrowUp" ? -1 : 1, preferredCellColumn.current);
        setActiveCell({ ...activeCell, anchorOffset: event.shiftKey ? activeCell.anchorOffset : offset, offset });
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "Home" || event.key === "End") {
        event.preventDefault();
        const hasRange = activeCell.anchorOffset !== activeCell.offset;
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
      const blocks = collectTextBlocks(engine.getDocument().content);
      if (blocks.length) {
        event.preventDefault();
        const block = event.key === "Home" ? blocks[0] : blocks[blocks.length - 1];
        const focus = { blockId: block.id, offset: event.key === "Home" ? 0 : block.text.length };
        syncSelection(event.shiftKey && engine.getSelection() ? { anchor: engine.getSelection()!.anchor, focus } : collapsedAt(focus));
        return;
      }
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      const blocks = collectTextBlocks(engine.getDocument().content);
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
      onStatus?.("Navegação por Tab entre células ainda não está habilitada no SmartCanvas.");
    }
  };
  return <section className="kz-smartcanvas-experiment" aria-label="Prévia experimental SmartCanvas" style={{ margin: "0 0 16px", padding: 16, border: "1px solid #93c5fd", borderRadius: 12, background: "rgba(59,130,246,.04)", position: "relative" }} onPointerDownCapture={event => { if ((event.target as HTMLElement).closest("input, button, textarea, select")) return; inputRef.current?.focus({ preventScroll: true }); }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
      <div><strong>SmartCanvas — prévia experimental</strong><div style={{ fontSize: 12, opacity: .75 }}>Edição inicial por seleção lógica: digitação, seleção e navegação entre blocos. O editor legado permanece disponível.</div></div>
      <span style={{ fontSize: 12 }}>{layout ? layout.pageCount + " página(s)" : "Layout indisponível"}</span>
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
    <textarea ref={inputRef} disabled={readOnly} aria-label="Entrada de texto do SmartCanvas" autoCapitalize="off" autoComplete="off" spellCheck={false} defaultValue="" onChange={event => { if (!composing.current) handleInput(event.currentTarget.value); }} onKeyDown={handleKeyDown} onCopy={event => { if (activeCell) { const start = Math.min(activeCell.anchorOffset, activeCell.offset), end = Math.max(activeCell.anchorOffset, activeCell.offset); if (start === end) return; event.clipboardData.setData("text/plain", activeCell.text.slice(start, end)); event.preventDefault(); return; } const current = engine.getSelection(); if (!current || (current.anchor.blockId === current.focus.blockId && current.anchor.offset === current.focus.offset)) return; event.clipboardData.setData("text/plain", getSelectedText(engine.getDocument().content, current)); event.preventDefault(); }} onCut={event => { if (readOnly) { event.preventDefault(); return; } if (activeCell) { const start = Math.min(activeCell.anchorOffset, activeCell.offset), end = Math.max(activeCell.anchorOffset, activeCell.offset); if (start === end) return; event.clipboardData.setData("text/plain", activeCell.text.slice(start, end)); event.preventDefault(); commitCellText(activeCell.text.slice(0, start) + activeCell.text.slice(end), start); return; } const current = engine.getSelection(); if (!current || (current.anchor.blockId === current.focus.blockId && current.anchor.offset === current.focus.offset)) return; event.clipboardData.setData("text/plain", getSelectedText(engine.getDocument().content, current)); event.preventDefault(); if (current.anchor.blockId !== current.focus.blockId) { const blocks = collectTextBlocks(engine.getDocument().content); const anchorIndex = blocks.findIndex(item => item.id === current.anchor.blockId), focusIndex = blocks.findIndex(item => item.id === current.focus.blockId); if (anchorIndex < 0 || focusIndex < 0) { onStatus?.("A seleção não corresponde a blocos editáveis; o texto foi copiado sem removê-lo."); return; } const firstIndex = Math.min(anchorIndex, focusIndex), lastIndex = Math.max(anchorIndex, focusIndex); const first = blocks[firstIndex], last = blocks[lastIndex]; const start = anchorIndex < focusIndex ? current.anchor.offset : current.focus.offset, end = anchorIndex < focusIndex ? current.focus.offset : current.anchor.offset; const commands = [deleteText({ blockId: first.id, start, end: first.text.length }), ...blocks.slice(firstIndex + 1, lastIndex).map(item => deleteText({ blockId: item.id, start: 0, end: item.text.length })), deleteText({ blockId: last.id, start: 0, end }), ...blocks.slice(firstIndex + 1, lastIndex + 1).map(item => mergeBlockWithPrevious({ blockId: item.id }))]; const result = engine.exec(commands, { group: "structural" }); if (!result.ok) { onStatus?.("O texto foi copiado, mas não foi possível removê-lo: " + result.error.message); return; } setSelection(engine.getSelection() ?? null); onDocumentChange(result.value.document); return; } const block = findBlock(engine.getDocument().content, current.focus.blockId); if (!block) return; const start = Math.min(current.anchor.offset, current.focus.offset), end = Math.max(current.anchor.offset, current.focus.offset); const result = engine.exec([deleteText({ blockId: block.id, start, end })], { group: "typing" }); if (result.ok) { setSelection(result.value.selection ?? null); onDocumentChange(result.value.document); } }} onPaste={event => { event.preventDefault(); handleInput(event.clipboardData.getData("text/plain")); }} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={event => { composing.current = false; handleInput(event.currentTarget.value); }} style={{ position: "absolute", width: 1, height: 1, opacity: 0, padding: 0, border: 0, overflow: "hidden", left: 0, bottom: 0, resize: "none" }} />
    {layout ? <div style={{ maxHeight: 560, overflow: "auto", background: "#e5e7eb", borderRadius: 8 }}>
      <CanvasDocumentRenderer layout={layout} document={document} headerText={headerText} footerText={footerText} headerAlign={headerAlign} footerAlign={footerAlign} showPageNumbers={showPageNumbers} selection={selection || undefined} showCaret={!!selection && !activeCell} activeCellId={activeCell?.cellId} activeCellSelection={activeCell || undefined} activeBlockId={activeBlockId || undefined} onHitTest={handleHit} />
    </div> : <p role="status">Aguardando documento/layout do motor.</p>}
  </section>;
}

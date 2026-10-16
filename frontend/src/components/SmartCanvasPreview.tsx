import { useMemo, useRef, useState } from "react";
import { collapsedAt, deleteText, getLineXAtOffset, getOffsetAtLineX, getPlainText, layoutDocument, mergeBlockWithPrevious, replaceRange, setCellText, splitBlock, type Editor as NexusEngineSession, type NexusDocument, type Selection, type SmartCanvasHitTarget } from "../../../packages/engine/src/index";
import { CanvasDocumentRenderer } from "./CanvasDocumentRenderer";
import { nextCodePointOffset, nextWordOffset, previousCodePointOffset, previousWordOffset, wordRangeAt } from "./smartCanvasTextOffsets";

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

function findBlock(nodes: readonly unknown[], id: string): TextBlock | undefined {
  return collectTextBlocks(nodes).find(block => block.id === id);
}

function findLayoutBlock(blocks: readonly import("../../../packages/engine/src/layout/layout").LayoutBlock[], id: string): import("../../../packages/engine/src/layout/layout").LayoutBlock | undefined {
  for (const block of blocks) {
    if (block.blockId === id) return block;
    const nested = findLayoutBlock(block.children ?? [], id);
    if (nested) return nested;
  }
  return undefined;
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

export function SmartCanvasPreview({ document, engine, headerText = "", footerText = "", showPageNumbers = false, readOnly = false, onDocumentChange, onStatus }: {
  document: NexusDocument;
  engine: NexusEngineSession;
  headerText?: string;
  footerText?: string;
  showPageNumbers?: boolean;
  readOnly?: boolean;
  onDocumentChange: (document: NexusDocument) => void;
  onStatus?: (message: string) => void;
}) {
  const [selection, setSelection] = useState<Selection | null>(engine.getSelection() ?? null);
  const [activeCell, setActiveCell] = useState<(EditableCell & { anchorOffset: number; offset: number }) | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
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
    if (target.kind === "text") {
      const block = findBlock(engine.getDocument().content, target.blockId);
      if (block && clickCount >= 2) {
        const range = clickCount >= 3
          ? { start: 0, end: block.text.length }
          : wordRangeAt(block.text, target.position.offset);
        const next: Selection = {
          anchor: { blockId: block.id, offset: range.start },
          focus: { blockId: block.id, offset: range.end },
        };
        syncSelection(next);
      } else {
        syncSelection(collapsedAt(target.position));
      }
      inputRef.current?.focus({ preventScroll: true });
      onStatus?.(clickCount >= 3 ? "Parágrafo selecionado." : clickCount >= 2 ? "Palavra selecionada." : "SmartCanvas: cursor no bloco " + target.blockId + ", posição " + target.position.offset + ".");
    } else if (target.kind === "table-cell") {
      const cell = collectTableCells(engine.getDocument().content).find(item => item.tableId === target.blockId && item.cellId === target.cellId);
      if (!cell) { onStatus?.("Não foi possível localizar a célula selecionada."); return; }
      const boundedOffset = Math.max(0, Math.min(cell.text.length, target.offset));
      const range = clickCount >= 3 ? { start: 0, end: cell.text.length } : clickCount >= 2 ? wordRangeAt(cell.text, boundedOffset) : { start: boundedOffset, end: boundedOffset };
      setActiveCell({ ...cell, anchorOffset: range.start, offset: range.end });
      inputRef.current?.focus({ preventScroll: true });
      onStatus?.(clickCount >= 3 ? "Texto da célula selecionado." : clickCount >= 2 ? "Palavra da célula selecionada." : "Editando célula da tabela. Use Tab para avançar entre células.");
    } else {
      onStatus?.("Bloco " + target.blockId + " identificado. Seleção estrutural ainda não está habilitada.");
    }
  };
  const commitText = (text: string) => {
    if (!text || readOnly) return;
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
    if (value && activeCell) {
      const start = Math.min(activeCell.anchorOffset, activeCell.offset);
      const end = Math.max(activeCell.anchorOffset, activeCell.offset);
      const nextText = activeCell.text.slice(0, start) + value + activeCell.text.slice(end);
      commitCellText(nextText, start + value.length);
    } else if (value) commitText(value);
    if (inputRef.current) inputRef.current.value = "";
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (readOnly) { event.preventDefault(); return; }
    if (activeCell) {
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
        const nextIndex = event.shiftKey ? (index - 1 + cells.length) % cells.length : (index + 1) % cells.length;
        const next = cells[nextIndex];
        if (next) setActiveCell({ ...next, anchorOffset: next.text.length, offset: next.text.length });
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "Home" || event.key === "End") {
        event.preventDefault();
        const hasRange = activeCell.anchorOffset !== activeCell.offset;
        const orderedStart = Math.min(activeCell.anchorOffset, activeCell.offset);
        const orderedEnd = Math.max(activeCell.anchorOffset, activeCell.offset);
        const offset = event.key === "Home" ? 0 : event.key === "End" ? activeCell.text.length :
          event.key === "ArrowLeft" ? (hasRange && !event.shiftKey ? orderedStart : previousCodePointOffset(activeCell.text, activeCell.offset)) :
          (hasRange && !event.shiftKey ? orderedEnd : nextCodePointOffset(activeCell.text, activeCell.offset));
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
        const result = engine.toggleStoredMark(mark);
        if (!result.ok) onStatus?.(result.error.message);
        else {
          setSelection(engine.getSelection() ?? null);
          onDocumentChange(engine.getDocument());
          onStatus?.(engine.getSelection() && engine.getSelection()!.anchor.offset !== engine.getSelection()!.focus.offset
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
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const current = engine.getSelection();
      if (!current || !layout) return;
      const blocks = collectTextBlocks(engine.getDocument().content);
      const focusIndex = blocks.findIndex(item => item.id === current.focus.blockId);
      const layoutBlock = findLayoutBlock(layout.pages.flatMap(page => page.blocks), current.focus.blockId);
      if (focusIndex < 0 || !layoutBlock?.lines.length) return;
      const lines = layoutBlock.lines;
      let lineIndex = lines.findIndex(line => current.focus.offset >= line.startOffset && current.focus.offset <= line.endOffset);
      if (lineIndex < 0) lineIndex = lines.findIndex(line => current.focus.offset < line.endOffset);
      if (lineIndex < 0) lineIndex = lines.length - 1;
      const direction = event.key === "ArrowUp" ? -1 : 1;
      const targetLineIndex = lineIndex + direction;
      let targetBlock = blocks[focusIndex];
      let targetOffset: number;
      if (targetLineIndex >= 0 && targetLineIndex < lines.length) {
        const sourceLine = lines[lineIndex];
        const targetLine = lines[targetLineIndex];
        const measure = createLayoutTextMeasurer();
        const sourceCaretX = getLineXAtOffset(sourceLine, current.focus.offset, measure);
        const targetLocalX = Math.max(0, sourceCaretX - sourceLine.x);
        targetOffset = getOffsetAtLineX(targetLine, targetLine.x + targetLocalX, measure);
      } else {
        const adjacentIndex = focusIndex + direction;
        if (adjacentIndex < 0 || adjacentIndex >= blocks.length) return;
        targetBlock = blocks[adjacentIndex];
        const adjacentLayout = findLayoutBlock(layout.pages.flatMap(page => page.blocks), targetBlock.id);
        const targetLines = adjacentLayout?.lines ?? [];
        if (!targetLines.length) targetOffset = direction < 0 ? targetBlock.text.length : 0;
        else {
          const edgeLine = direction < 0 ? targetLines[targetLines.length - 1] : targetLines[0];
          targetOffset = direction < 0 ? edgeLine.endOffset : edgeLine.startOffset;
        }
      }
      event.preventDefault();
      const focus = { blockId: targetBlock.id, offset: Math.max(0, Math.min(targetBlock.text.length, targetOffset)) };
      syncSelection(event.shiftKey ? { anchor: current.anchor, focus } : collapsedAt(focus));
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "Home" || event.key === "End") {
      const current = engine.getSelection();
      if (!current) return;
      const blocks = collectTextBlocks(engine.getDocument().content);
      const focusIndex = blocks.findIndex(block => block.id === current.focus.blockId);
      if (focusIndex < 0) return;
      const block = blocks[focusIndex];
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
        const edge = backwards ? start : end;
        event.preventDefault();
        syncSelection(collapsedAt(edge));
        return;
      }

      if (event.key === "Home") offset = 0;
      else if (event.key === "End") offset = block.text.length;
      else if (backwards) {
        if (offset > 0) offset = previousCodePointOffset(block.text, offset);
        else if (focusIndex > 0) {
          nextBlock = blocks[focusIndex - 1];
          offset = nextBlock.text.length;
        }
      } else {
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
        const result = engine.exec(commands, { group: "typing" });
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
  return <section className="kz-smartcanvas-experiment" aria-label="Prévia experimental SmartCanvas" style={{ margin: "0 0 16px", padding: 16, border: "1px solid #93c5fd", borderRadius: 12, background: "rgba(59,130,246,.04)", position: "relative" }} onPointerDownCapture={() => inputRef.current?.focus({ preventScroll: true })}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
      <div><strong>SmartCanvas — prévia experimental</strong><div style={{ fontSize: 12, opacity: .75 }}>Edição inicial por seleção lógica: digitação, seleção e navegação entre blocos. O editor legado permanece disponível.</div></div>
      <span style={{ fontSize: 12 }}>{layout ? layout.pageCount + " página(s)" : "Layout indisponível"}</span>
    </div>
    <textarea ref={inputRef} disabled={readOnly} aria-label="Entrada de texto do SmartCanvas" autoCapitalize="off" autoComplete="off" spellCheck={false} defaultValue="" onChange={event => { if (!composing.current) handleInput(event.currentTarget.value); }} onKeyDown={handleKeyDown} onCopy={event => { if (activeCell) { const start = Math.min(activeCell.anchorOffset, activeCell.offset), end = Math.max(activeCell.anchorOffset, activeCell.offset); if (start === end) return; event.clipboardData.setData("text/plain", activeCell.text.slice(start, end)); event.preventDefault(); return; } const current = engine.getSelection(); if (!current || (current.anchor.blockId === current.focus.blockId && current.anchor.offset === current.focus.offset)) return; event.clipboardData.setData("text/plain", getSelectedText(engine.getDocument().content, current)); event.preventDefault(); }} onCut={event => { if (readOnly) { event.preventDefault(); return; } if (activeCell) { const start = Math.min(activeCell.anchorOffset, activeCell.offset), end = Math.max(activeCell.anchorOffset, activeCell.offset); if (start === end) return; event.clipboardData.setData("text/plain", activeCell.text.slice(start, end)); event.preventDefault(); commitCellText(activeCell.text.slice(0, start) + activeCell.text.slice(end), start); return; } const current = engine.getSelection(); if (!current || (current.anchor.blockId === current.focus.blockId && current.anchor.offset === current.focus.offset)) return; event.clipboardData.setData("text/plain", getSelectedText(engine.getDocument().content, current)); event.preventDefault(); if (current.anchor.blockId !== current.focus.blockId) { const blocks = collectTextBlocks(engine.getDocument().content); const anchorIndex = blocks.findIndex(item => item.id === current.anchor.blockId), focusIndex = blocks.findIndex(item => item.id === current.focus.blockId); if (anchorIndex < 0 || focusIndex < 0) { onStatus?.("A seleção não corresponde a blocos editáveis; o texto foi copiado sem removê-lo."); return; } const firstIndex = Math.min(anchorIndex, focusIndex), lastIndex = Math.max(anchorIndex, focusIndex); const first = blocks[firstIndex], last = blocks[lastIndex]; const start = anchorIndex < focusIndex ? current.anchor.offset : current.focus.offset, end = anchorIndex < focusIndex ? current.focus.offset : current.anchor.offset; const commands = [deleteText({ blockId: first.id, start, end: first.text.length }), ...blocks.slice(firstIndex + 1, lastIndex).map(item => deleteText({ blockId: item.id, start: 0, end: item.text.length })), deleteText({ blockId: last.id, start: 0, end }), ...blocks.slice(firstIndex + 1, lastIndex + 1).map(item => mergeBlockWithPrevious({ blockId: item.id }))]; const result = engine.exec(commands, { group: "structural" }); if (!result.ok) { onStatus?.("O texto foi copiado, mas não foi possível removê-lo: " + result.error.message); return; } setSelection(engine.getSelection() ?? null); onDocumentChange(result.value.document); return; } const block = findBlock(engine.getDocument().content, current.focus.blockId); if (!block) return; const start = Math.min(current.anchor.offset, current.focus.offset), end = Math.max(current.anchor.offset, current.focus.offset); const result = engine.exec([deleteText({ blockId: block.id, start, end })], { group: "typing" }); if (result.ok) { setSelection(result.value.selection ?? null); onDocumentChange(result.value.document); } }} onPaste={event => { event.preventDefault(); handleInput(event.clipboardData.getData("text/plain")); }} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={event => { composing.current = false; handleInput(event.currentTarget.value); }} style={{ position: "absolute", width: 1, height: 1, opacity: 0, padding: 0, border: 0, overflow: "hidden", left: 0, bottom: 0, resize: "none" }} />
    {layout ? <div style={{ maxHeight: 560, overflow: "auto", background: "#e5e7eb", borderRadius: 8 }}>
      <CanvasDocumentRenderer layout={layout} document={document} headerText={headerText} footerText={footerText} showPageNumbers={showPageNumbers} selection={selection || undefined} showCaret={!!selection && !activeCell} activeCellId={activeCell?.cellId} activeCellSelection={activeCell || undefined} onHitTest={handleHit} />
    </div> : <p role="status">Aguardando documento/layout do motor.</p>}
  </section>;
}

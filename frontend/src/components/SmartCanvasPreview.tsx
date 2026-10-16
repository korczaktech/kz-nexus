import { useMemo, useRef, useState } from "react";
import { collapsedAt, deleteText, getPlainText, layoutDocument, type Editor as NexusEngineSession, type NexusDocument, type Selection, type SmartCanvasHitTarget } from "../../../packages/engine/src/index";
import { CanvasDocumentRenderer } from "./CanvasDocumentRenderer";

function findBlock(nodes: readonly unknown[], id: string): { id: string; text: string } | undefined {
  for (const value of nodes) {
    if (!value || typeof value !== "object") continue;
    const node = value as { id?: unknown; type?: unknown; children?: unknown };
    if (node.id === id && (node.type === "paragraph" || node.type === "heading")) {
      return { id, text: getPlainText(value as Extract<NexusDocument["content"][number], { type: "paragraph" | "heading" }>) };
    }
    if (Array.isArray(node.children)) {
      const nested = findBlock(node.children, id);
      if (nested) return nested;
    }
  }
  return undefined;
}

export function SmartCanvasPreview({ document, engine, headerText = "", footerText = "", showPageNumbers = false, onDocumentChange, onStatus }: {
  document: NexusDocument;
  engine: NexusEngineSession;
  headerText?: string;
  footerText?: string;
  showPageNumbers?: boolean;
  onDocumentChange: (document: NexusDocument) => void;
  onStatus?: (message: string) => void;
}) {
  const [selection, setSelection] = useState<Selection | null>(engine.getSelection() ?? null);
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
  const handleHit = (target: SmartCanvasHitTarget) => {
    if (target.kind === "text") {
      const next = collapsedAt(target.position);
      syncSelection(next);
      inputRef.current?.focus({ preventScroll: true });
      onStatus?.("SmartCanvas: cursor no bloco " + target.blockId + ", posição " + target.position.offset + ".");
    } else if (target.kind === "table-cell") {
      onStatus?.("A célula foi identificada, mas a edição de texto em células ainda não está habilitada.");
    } else {
      onStatus?.("Bloco " + target.blockId + " identificado. Seleção estrutural ainda não está habilitada.");
    }
  };
  const commitText = (text: string) => {
    if (!text) return;
    const result = engine.insertTextAtSelection(text);
    if (!result.ok) { onStatus?.(result.error.message); return; }
    syncSelection(result.value.selection);
    onDocumentChange(result.value.document);
  };
  const handleInput = (value: string) => {
    if (value) commitText(value);
    if (inputRef.current) inputRef.current.value = "";
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey ? engine.redo() : engine.undo()) {
        const next = engine.getSelection();
        setSelection(next ?? null);
        onDocumentChange(engine.getDocument());
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      if (engine.redo()) {
        setSelection(engine.getSelection() ?? null);
        onDocumentChange(engine.getDocument());
      }
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "Home" || event.key === "End") {
      const current = engine.getSelection();
      if (!current || current.anchor.blockId !== current.focus.blockId) return;
      const block = findBlock(engine.getDocument().content, current.focus.blockId);
      if (!block) return;
      const low = Math.min(current.anchor.offset, current.focus.offset);
      const high = Math.max(current.anchor.offset, current.focus.offset);
      const offset = event.key === "Home" ? 0 : event.key === "End" ? block.text.length :
        event.key === "ArrowLeft" ? (low !== high ? low : Math.max(0, current.focus.offset - 1)) :
        (low !== high ? high : Math.min(block.text.length, current.focus.offset + 1));
      event.preventDefault();
      const next = collapsedAt({ blockId: block.id, offset });
      syncSelection(next);
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      const current = engine.getSelection();
      if (!current || current.anchor.blockId !== current.focus.blockId) {
        onStatus?.("A exclusão entre blocos ainda não está disponível no SmartCanvas.");
        return;
      }
      const block = findBlock(engine.getDocument().content, current.focus.blockId);
      if (!block) return;
      let start = Math.min(current.anchor.offset, current.focus.offset);
      let end = Math.max(current.anchor.offset, current.focus.offset);
      if (start === end) {
        if (event.key === "Backspace") start = Math.max(0, start - 1);
        else end = Math.min(block.text.length, end + 1);
      }
      if (start === end) return;
      const result = engine.exec([deleteText({ blockId: block.id, start, end })], { group: "typing" });
      if (!result.ok) { onStatus?.(result.error.message); return; }
      setSelection(result.value.selection ?? null);
      onDocumentChange(result.value.document);
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      onStatus?.(event.key === "Enter" ? "Quebra de parágrafo ainda não está habilitada no controlador SmartCanvas." : "Navegação por Tab ainda não está habilitada no SmartCanvas.");
    }
  };
  return <section className="kz-smartcanvas-experiment" aria-label="Prévia experimental SmartCanvas" style={{ margin: "0 0 16px", padding: 16, border: "1px solid #93c5fd", borderRadius: 12, background: "rgba(59,130,246,.04)", position: "relative" }} onPointerDownCapture={() => inputRef.current?.focus({ preventScroll: true })}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
      <div><strong>SmartCanvas — prévia experimental</strong><div style={{ fontSize: 12, opacity: .75 }}>Edição inicial por seleção lógica: digitação, exclusão e navegação no bloco. O editor legado permanece disponível.</div></div>
      <span style={{ fontSize: 12 }}>{layout ? layout.pageCount + " página(s)" : "Layout indisponível"}</span>
    </div>
    <textarea ref={inputRef} aria-label="Entrada de texto do SmartCanvas" autoCapitalize="off" autoComplete="off" spellCheck={false} defaultValue="" onChange={event => { if (!composing.current) handleInput(event.currentTarget.value); }} onKeyDown={handleKeyDown} onPaste={event => { event.preventDefault(); handleInput(event.clipboardData.getData("text/plain")); }} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={event => { composing.current = false; handleInput(event.currentTarget.value); }} style={{ position: "absolute", width: 1, height: 1, opacity: 0, padding: 0, border: 0, overflow: "hidden", left: 0, bottom: 0, resize: "none" }} />
    {layout ? <div style={{ maxHeight: 560, overflow: "auto", background: "#e5e7eb", borderRadius: 8 }}>
      <CanvasDocumentRenderer layout={layout} document={document} headerText={headerText} footerText={footerText} showPageNumbers={showPageNumbers} selection={selection || undefined} showCaret={!!selection} onHitTest={handleHit} />
    </div> : <p role="status">Aguardando documento/layout do motor.</p>}
  </section>;
}

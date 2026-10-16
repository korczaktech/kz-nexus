import { useMemo, useState } from "react";
import { collapsedAt, layoutDocument, type NexusDocument, type Selection, type SmartCanvasHitTarget } from "../../../packages/engine/src/index";
import { CanvasDocumentRenderer } from "./CanvasDocumentRenderer";

export function SmartCanvasPreview({ document, headerText = "", footerText = "", showPageNumbers = false, onLogicalSelection, onStatus }: {
  document: NexusDocument;
  headerText?: string;
  footerText?: string;
  showPageNumbers?: boolean;
  onLogicalSelection: (selection: Selection) => void;
  onStatus?: (message: string) => void;
}) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const layout = useMemo(() => {
    try { return layoutDocument(document); }
    catch { return null; }
  }, [document]);
  const handleHit = (target: SmartCanvasHitTarget) => {
    if (target.kind === "text") {
      const next = collapsedAt(target.position);
      setSelection(next);
      onLogicalSelection(next);
      onStatus?.("Seleção lógica posicionada no bloco " + target.blockId + ".");
    } else if (target.kind === "table-cell") {
      onStatus?.("Célula identificada pelo hit-testing; edição lógica de células ainda não está implementada.");
    } else {
      onStatus?.("Bloco " + target.blockId + " identificado; seleção estrutural ainda não está implementada.");
    }
  };
  return <section className="kz-smartcanvas-experiment" aria-label="Prévia experimental SmartCanvas" style={{ margin: "0 0 16px", padding: 16, border: "1px solid #93c5fd", borderRadius: 12, background: "rgba(59,130,246,.04)" }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
      <div><strong>SmartCanvas — prévia experimental</strong><div style={{ fontSize: 12, opacity: .75 }}>Renderização do motor e seleção lógica por clique. A edição principal continua no modo legado.</div></div>
      <span style={{ fontSize: 12 }}>{layout ? layout.pageCount + " página(s)" : "Layout indisponível"}</span>
    </div>
    {layout ? <div style={{ maxHeight: 560, overflow: "auto", background: "#e5e7eb", borderRadius: 8 }}>
      <CanvasDocumentRenderer layout={layout} document={document} headerText={headerText} footerText={footerText} showPageNumbers={showPageNumbers} selection={selection || undefined} showCaret={!!selection} onHitTest={handleHit} />
    </div> : <p role="status">Aguardando documento/layout do motor.</p>}
  </section>;
}

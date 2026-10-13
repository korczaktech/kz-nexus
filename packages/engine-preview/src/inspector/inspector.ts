import type { PreviewController } from "../services/controller";

type Tab = "tree" | "json" | "selection" | "validation" | "history" | "meta";

const TABS: { id: Tab; label: string }[] = [
  { id: "tree", label: "Árvore" },
  { id: "json", label: "Modelo JSON" },
  { id: "selection", label: "Seleção" },
  { id: "validation", label: "Validação" },
  { id: "history", label: "Histórico" },
  { id: "meta", label: "Metadados" },
];

const MAX_TREE_NODES = 1500;
const MAX_JSON_CHARS = 200_000;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<Record<string, string>> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) if (v !== undefined) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

/** Read-only view of the REAL engine state. Nothing here is cached or mirrored. */
export class Inspector {
  private tab: Tab = "tree";
  private readonly body = h("div", { class: "inspector-body" });
  private readonly tabs = h("div", { class: "tabs", role: "tablist" });

  constructor(private readonly host: HTMLElement, private readonly controller: PreviewController) {
    for (const t of TABS) {
      const b = h("button", { class: "tab", role: "tab", "data-tab": t.id, type: "button" }, t.label);
      b.addEventListener("click", () => {
        this.tab = t.id;
        this.render();
      });
      this.tabs.append(b);
    }
    host.replaceChildren(this.tabs, this.body);
  }

  render(): void {
    for (const b of Array.from(this.tabs.children)) {
      const active = b.getAttribute("data-tab") === this.tab;
      b.setAttribute("aria-selected", String(active));
    }
    const content = this.renderTab();
    this.body.replaceChildren(content);
    this.body.setAttribute("data-active-tab", this.tab);
  }

  private renderTab(): HTMLElement {
    const c = this.controller;
    switch (this.tab) {
      case "tree": return this.renderTree();
      case "json": {
        const json = JSON.stringify(c.document, null, 2);
        const truncated = json.length > MAX_JSON_CHARS;
        return h("div", {}, h("pre", { class: "code", "data-testid": "model-json" }, truncated ? json.slice(0, MAX_JSON_CHARS) : json), truncated ? h("p", { class: "muted" }, `Exibição truncada em ${MAX_JSON_CHARS} de ${json.length} caracteres.`) : "");
      }
      case "selection": {
        const sel = c.selection;
        return h("pre", { class: "code", "data-testid": "selection-json" }, sel ? JSON.stringify(sel, null, 2) : "Sem seleção lógica.");
      }
      case "validation": {
        const issues = c.validationIssues();
        if (issues.length === 0) return h("p", { class: "ok", "data-testid": "validation-status" }, "O motor não reporta problemas de validação para o estado atual.");
        return h("div", {}, h("p", { class: "bad", "data-testid": "validation-status" }, `${issues.length} problema(s):`), h("pre", { class: "code" }, JSON.stringify(issues, null, 2)));
      }
      case "history": {
        const info = c.historyInfo;
        return h("dl", { class: "kv", "data-testid": "history-info" },
          h("dt", {}, "Passos para desfazer"), h("dd", {}, String(info.undo)),
          h("dt", {}, "Passos para refazer"), h("dd", {}, String(info.redo)),
          h("dt", {}, "Pode desfazer"), h("dd", {}, String(c.canUndo)),
          h("dt", {}, "Pode refazer"), h("dd", {}, String(c.canRedo)));
      }
      case "meta": {
        const d = c.document;
        const v = c.versions;
        return h("dl", { class: "kv" },
          h("dt", {}, "Id do documento"), h("dd", {}, d.id),
          h("dt", {}, "Versão do esquema"), h("dd", {}, `${d.schemaVersion} (motor: ${v.schema})`),
          h("dt", {}, "Versão do formato .nsx"), h("dd", {}, String(v.format)),
          h("dt", {}, "Página"), h("dd", {}, `${d.pageConfig.width}×${d.pageConfig.height} ${d.pageConfig.unit}, ${d.pageConfig.orientation}`),
          h("dt", {}, "Metadados"), h("dd", {}, JSON.stringify(d.metadata)),
          h("dt", {}, "Recursos"), h("dd", {}, d.resources.length === 0 ? "nenhum" : d.resources.map((r) => `${r.id} (${r.mimeType}, ${r.byteLength} B)`).join("; ")));
      }
    }
  }

  private renderTree(): HTMLElement {
    let budget = MAX_TREE_NODES;
    let omitted = 0;
    const visit = (node: { type: string; id: string; children?: unknown[]; text?: string; marks?: { type: string }[] }): HTMLElement | undefined => {
      if (budget <= 0) { omitted += 1; return undefined; }
      budget -= 1;
      const label = `${node.type} · ${node.id}`;
      if (node.type === "text") {
        const marks = node.marks && node.marks.length ? ` [${node.marks.map((m) => m.type).join(", ")}]` : "";
        return h("div", { class: "leaf" }, `text · ${node.id}${marks} ${JSON.stringify(node.text ?? "")}`);
      }
      if (Array.isArray(node.children) && node.children.length) {
        const d = h("details", { open: "" }, h("summary", {}, label));
        for (const child of node.children) {
          const el = visit(child as never);
          if (el) d.append(el);
        }
        return d;
      }
      return h("div", { class: "leaf" }, label);
    };
    const root = h("div", { class: "tree", "data-testid": "tree" });
    for (const block of this.controller.document.content) {
      const el = visit(block as never);
      if (el) root.append(el);
    }
    if (omitted > 0) root.append(h("p", { class: "muted" }, `… ${omitted}+ nó(s) omitidos para manter a interface responsiva (limite de ${MAX_TREE_NODES}).`));
    return root;
  }
}

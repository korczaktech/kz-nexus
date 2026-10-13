import type { PreviewController } from "../services/controller";
import { FIXTURES } from "../fixtures/builtin";
import { downloadText, readFileAsText } from "../services/files";

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<Record<string, string>> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) if (v !== undefined) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

function fmt(ms: number | undefined): string {
  return ms === undefined ? "—" : `${ms.toFixed(2)} ms`;
}

export class Diagnostics {
  private readonly log = h("ol", { class: "log", "data-testid": "notice-log", "aria-live": "polite" });
  private readonly metrics = h("dl", { class: "kv", "data-testid": "metrics" });
  private readonly serialization = h("pre", { class: "code", "data-testid": "serialization", hidden: "" });

  constructor(private readonly host: HTMLElement, private readonly controller: PreviewController) {
    const fileInput = h("input", { type: "file", accept: ".nsx,application/json", hidden: "", "data-testid": "open-input" });
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      fileInput.value = "";
      if (!file) return;
      let text: string;
      try {
        text = await readFileAsText(file);
      } catch (error) {
        controller.notify("error", `Não foi possível ler o arquivo "${file.name}".`, String(error));
        return;
      }
      controller.openFromText(text, file.name);
    });

    const button = (id: string, label: string, onClick: () => void): HTMLButtonElement => {
      const b = h("button", { type: "button", "data-action": id }, label);
      b.addEventListener("click", onClick);
      return b;
    };

    const fixtureSelect = h("select", { "data-testid": "fixture-select", "aria-label": "Fixtures" });
    for (const f of FIXTURES) fixtureSelect.append(h("option", { value: f.id }, f.label));
    const loadFixture = button("load-fixture", "Carregar fixture", () => {
      const fixture = FIXTURES.find((f) => f.id === fixtureSelect.value);
      if (!fixture) return;
      try {
        if (fixture.kind === "document") controller.loadDocument(fixture.build(), `${fixture.id}.nsx`);
        else controller.openFromText(fixture.build(), `${fixture.id}.nsx`);
      } catch (error) {
        controller.notify("error", `Falha ao construir a fixture "${fixture.label}".`, String(error));
      }
    });

    const actions = h("div", { class: "actions" },
      button("new", "Novo documento", () => controller.newDocument()),
      button("open", "Abrir .nsx…", () => fileInput.click()),
      button("save", "Salvar .nsx", () => this.save()),
      button("validate", "Validar", () => { controller.validateNow(); }),
      button("serialize", "Ver serialização", () => this.showSerialization()),
      button("roundtrip", "Round-trip", () => { controller.roundTrip(); }),
      button("undo", "Desfazer", () => { controller.undo(); }),
      button("redo", "Refazer", () => { controller.redo(); }),
    );
    const fixtures = h("div", { class: "actions" }, fixtureSelect, loadFixture);
    const clear = button("clear-log", "Limpar registro", () => controller.clearNotices());

    host.replaceChildren(
      h("h3", {}, "Ações"), actions, fileInput,
      h("h3", {}, "Fixtures"), fixtures,
      h("h3", {}, "Métricas"), this.metrics,
      h("h3", {}, "Serialização"), this.serialization,
      h("div", { class: "row" }, h("h3", {}, "Registro de mensagens"), clear), this.log,
    );
  }

  private save(): void {
    const result = this.controller.serialize();
    if (!result.ok) return;
    const raw = this.controller.fileName.replace(/\.nsx$/i, "") || "documento";
    const name = `${raw}.nsx`;
    const bytes = downloadText(name, result.value);
    this.controller.markExported(name, bytes);
  }

  private showSerialization(): void {
    const result = this.controller.serialize();
    if (!result.ok) return;
    this.serialization.hidden = false;
    const text = result.value;
    this.serialization.textContent = text.length > 200_000 ? `${text.slice(0, 200_000)}\n… (truncado, total ${text.length} caracteres)` : text;
  }

  render(): void {
    const c = this.controller;
    const m = c.metrics;
    this.metrics.replaceChildren(
      h("dt", {}, "Última operação"), h("dd", {}, `${m.lastActionLabel} (${fmt(m.lastActionMs)})`),
      h("dt", {}, "Validação"), h("dd", {}, fmt(m.lastValidateMs)),
      h("dt", {}, "Serialização"), h("dd", {}, fmt(m.lastSerializeMs)),
      h("dt", {}, "Leitura .nsx"), h("dd", {}, fmt(m.lastParseMs)),
      h("dt", {}, "Tamanho .nsx"), h("dd", {}, m.serializedBytes === undefined ? "—" : `${m.serializedBytes} B`),
      h("dt", {}, "Nós / blocos / recursos"), h("dd", {}, `${m.nodeCount} / ${m.blockCount} / ${m.resourceCount}`),
    );
    this.log.replaceChildren(
      ...[...c.notices].reverse().map((n) => {
        const li = h("li", { class: `notice ${n.kind}`, "data-kind": n.kind }, h("span", {}, n.text));
        if (n.detail) {
          const d = h("details", {}, h("summary", {}, "detalhes técnicos"), h("pre", { class: "code" }, n.detail));
          li.append(d);
        }
        return li;
      }),
    );
  }
}

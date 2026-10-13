import {
  CURRENT_NSX_FORMAT_VERSION,
  CURRENT_SCHEMA_VERSION,
  addTableColumn,
  addTableRow,
  applyMark,
  createEditor,
  createIdGenerator,
  deleteBlock,
  deleteText,
  insertBlockquote,
  convertBlockToBlockquote,
  convertBlockToList,
  convertListType,
  insertImage,
  insertList,
  insertListItem,
  insertTable,
  insertText,
  insertThematicBreak,
  mergeBlockWithPrevious,
  openNsx,
  removeImage,
  removeMark,
  removeTableColumn,
  removeTableRow,
  saveNsx,
  setAlign,
  setHeadingLevel,
  setPageConfig,
  splitBlock,
  splitListItem,
  systemClock,
  type Alignment,
  type Clock,
  type Command,
  type EngineError,
  type Editor,
  type IdGenerator,
  type Mark,
  type MarkType,
  type NexusDocument,
  type Position,
  type Result,
  type Selection,
  type ValidationIssue,
} from "@korczak/nexus-engine";
import { collectTextBlocks, countNodes, nextBoundary, previousBoundary, textOf, type TextBlockInfo } from "./model-utils";

export type NoticeKind = "success" | "error" | "info";

export interface Notice {
  id: number;
  kind: NoticeKind;
  text: string;
  /** Technical detail (error code, node path, JSON details), shown on demand. */
  detail?: string;
  at: number;
}

export interface Metrics {
  lastActionLabel: string;
  lastActionMs: number;
  lastValidateMs?: number;
  lastSerializeMs?: number;
  lastParseMs?: number;
  serializedBytes?: number;
  nodeCount: number;
  blockCount: number;
  resourceCount: number;
}

export interface PreviewControllerOptions {
  idGenerator?: IdGenerator;
  clock?: Clock;
  /** High-resolution timer used for metrics (defaults to performance.now / Date.now). */
  timer?: () => number;
}

const ERROR_TEXT: Record<string, string> = {
  INVALID_DOCUMENT: "O documento é inválido.",
  NODE_NOT_FOUND: "Um nó referenciado não existe.",
  INVALID_POSITION: "Posição inválida no documento.",
  UNSUPPORTED_OPERATION: "O motor não suporta esta operação neste contexto.",
  UNSUPPORTED_FORMAT: "Formato de arquivo não reconhecido.",
  VERSION_MISMATCH: "Versão do arquivo incompatível com este motor.",
  RESOURCE_NOT_FOUND: "Recurso ausente.",
  RESOURCE_IN_USE: "O recurso ainda está em uso.",
  LIMIT_EXCEEDED: "Um limite de segurança foi excedido.",
  MIGRATION_FAILED: "A migração do arquivo falhou.",
  CORRUPTED_CONTENT: "O arquivo está corrompido.",
  TRANSACTION_REJECTED: "A operação foi rejeitada pelo motor; o documento não foi alterado.",
};

function describe(error: EngineError): { text: string; detail: string } {
  const text = ERROR_TEXT[error.code] ?? "Erro do motor.";
  const detail = JSON.stringify({ code: error.code, message: error.message, path: error.path, details: safeDetails(error.details) }, null, 2);
  return { text: `${text} (${error.code})`, detail };
}

function safeDetails(details: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(details, (_k, v: unknown) => (v instanceof Error ? { name: v.name, message: v.message } : v)));
  } catch {
    return String(details);
  }
}

function defaultTimer(): number {
  const perf = (globalThis as { performance?: { now(): number } }).performance;
  return perf ? perf.now() : Date.now();
}

/**
 * Framework-free application controller of the preview. It owns ONE engine
 * `Editor` and only talks to it through the engine's public API. All state
 * shown by the UI (document, selection, validation, history, metrics) is read
 * from the engine; nothing is mirrored in a parallel model.
 */
export class PreviewController {
  private editor: Editor;
  private readonly listeners = new Set<() => void>();
  private readonly generateId: IdGenerator;
  private readonly clock: Clock;
  private readonly timer: () => number;
  private noticeSeq = 0;
  private cleanSnapshot: NexusDocument;
  private fileNameValue = "sem-titulo.nsx";
  readonly notices: Notice[] = [];
  metrics: Metrics;
  lastSerialization: string | undefined;

  constructor(options: PreviewControllerOptions = {}) {
    this.generateId = options.idGenerator ?? createIdGenerator("n");
    this.clock = options.clock ?? systemClock;
    this.timer = options.timer ?? defaultTimer;
    this.editor = this.makeEditor();
    this.cleanSnapshot = this.editor.getDocument();
    this.metrics = this.computeMetrics("Documento criado", 0);
    const first = collectTextBlocks(this.editor.getDocument())[0];
    if (first) this.editor.setSelection({ anchor: { blockId: first.block.id, offset: 0 }, focus: { blockId: first.block.id, offset: 0 } });
  }

  // ───────────────────────────── observation ─────────────────────────────
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private emit(): void {
    for (const l of [...this.listeners]) l();
  }
  get document(): NexusDocument {
    return this.editor.getDocument();
  }
  get selection(): Selection | undefined {
    return this.editor.getSelection();
  }
  get fileName(): string {
    return this.fileNameValue;
  }
  get dirty(): boolean {
    return this.editor.getDocument() !== this.cleanSnapshot;
  }
  get canUndo(): boolean {
    return this.editor.canUndo();
  }
  get canRedo(): boolean {
    return this.editor.canRedo();
  }
  get historyInfo(): { undo: number; redo: number } {
    return this.editor.getHistoryInfo();
  }
  get versions(): { schema: number; format: number } {
    return { schema: CURRENT_SCHEMA_VERSION, format: CURRENT_NSX_FORMAT_VERSION };
  }
  validationIssues(): ValidationIssue[] {
    return this.editor.getValidationIssues();
  }
  textBlocks(): TextBlockInfo[] {
    return collectTextBlocks(this.document);
  }

  // ───────────────────────────── notices ─────────────────────────────
  notify(kind: NoticeKind, text: string, detail?: string): void {
    this.notices.push({ id: ++this.noticeSeq, kind, text, detail, at: this.clock() });
    if (this.notices.length > 200) this.notices.shift();
    this.emit();
  }
  private fail(error: EngineError): void {
    const d = describe(error);
    this.notify("error", d.text, d.detail);
  }
  clearNotices(): void {
    this.notices.length = 0;
    this.emit();
  }

  // ───────────────────────────── selection ─────────────────────────────
  setSelection(selection: Selection | undefined): Result<void> {
    const result = this.editor.setSelection(selection);
    if (!result.ok) this.fail(result.error);
    this.emit();
    return result;
  }

  private infoFor(blockId: string, infos = this.textBlocks()): { info: TextBlockInfo; index: number } | undefined {
    const index = infos.findIndex((i) => i.block.id === blockId);
    const info = infos[index];
    return info ? { info, index } : undefined;
  }

  /** Selection with start/end in document order, or undefined when there is none. */
  private range(): { start: Position; end: Position; infos: TextBlockInfo[]; startIndex: number; endIndex: number; collapsed: boolean } | undefined {
    const sel = this.editor.getSelection();
    if (!sel) return undefined;
    const infos = this.textBlocks();
    const a = this.infoFor(sel.anchor.blockId, infos);
    const f = this.infoFor(sel.focus.blockId, infos);
    if (!a || !f) return undefined;
    const forward = a.index < f.index || (a.index === f.index && sel.anchor.offset <= sel.focus.offset);
    const start = forward ? sel.anchor : sel.focus;
    const end = forward ? sel.focus : sel.anchor;
    const startIndex = forward ? a.index : f.index;
    const endIndex = forward ? f.index : a.index;
    return { start, end, infos, startIndex, endIndex, collapsed: startIndex === endIndex && start.offset === end.offset };
  }

  // ───────────────────────────── execution ─────────────────────────────
  private run(label: string, commands: Command[], group: "typing" | "formatting" | "structural", restore?: Selection): Result<{ document: NexusDocument; selection?: Selection }> {
    const t0 = this.timer();
    const result = this.editor.exec(commands, { group });
    const ms = this.timer() - t0;
    if (!result.ok) {
      this.fail(result.error);
      return result;
    }
    if (restore) this.editor.setSelection(restore);
    this.metrics = { ...this.computeMetrics(label, ms), lastValidateMs: this.metrics.lastValidateMs, lastSerializeMs: this.metrics.lastSerializeMs, lastParseMs: this.metrics.lastParseMs, serializedBytes: this.metrics.serializedBytes };
    this.emit();
    return result;
  }

  private computeMetrics(label: string, ms: number): Metrics {
    const doc = this.editor.getDocument();
    return { lastActionLabel: label, lastActionMs: ms, nodeCount: countNodes(doc), blockCount: doc.content.length, resourceCount: doc.resources.length };
  }

  private deleteRangeCommands(r: NonNullable<ReturnType<PreviewController["range"]>>): Command[] | undefined {
    const first = r.infos[r.startIndex]!;
    const last = r.infos[r.endIndex]!;
    if (r.startIndex === r.endIndex) return [deleteText({ blockId: first.block.id, start: r.start.offset, end: r.end.offset })];
    if (first.container !== "top" || last.container !== "top") {
      this.notify("info", "Remover texto entre estruturas diferentes (listas, tabelas, citações) ainda não é suportado pelo motor. Selecione dentro de um único bloco.");
      return undefined;
    }
    const doc = this.document;
    const cmds: Command[] = [
      deleteText({ blockId: first.block.id, start: r.start.offset, end: textOf(first.block).length }),
      deleteText({ blockId: last.block.id, start: 0, end: r.end.offset }),
    ];
    for (let i = first.topIndex + 1; i < last.topIndex; i++) cmds.push(deleteBlock({ blockId: doc.content[i]!.id }));
    cmds.push(mergeBlockWithPrevious({ blockId: last.block.id }));
    return cmds;
  }

  // ───────────────────────────── text editing ─────────────────────────────
  insertText(text: string): boolean {
    if (text.length === 0) return false;
    let r = this.range();
    if (!r) {
      const infos = this.textBlocks();
      const last = infos[infos.length - 1];
      if (!last) return false;
      this.editor.setSelection({ anchor: { blockId: last.block.id, offset: textOf(last.block).length }, focus: { blockId: last.block.id, offset: textOf(last.block).length } });
      r = this.range();
      if (!r) return false;
    }
    const cmds: Command[] = [];
    if (!r.collapsed) {
      const del = this.deleteRangeCommands(r);
      if (!del) return false;
      cmds.push(...del);
      const target = r.startIndex === r.endIndex ? r.start.blockId : r.start.blockId;
      cmds.push(insertText({ blockId: target, offset: r.start.offset, text }));
      // After a cross-block merge the start block survives; same-block keeps its id.
      return this.run("Digitar (substituindo seleção)", cmds, "structural").ok;
    }
    cmds.push(insertText({ blockId: r.start.blockId, offset: r.start.offset, text }));
    return this.run("Digitar", cmds, "typing").ok;
  }

  deleteBackward(): boolean {
    const r = this.range();
    if (!r) return false;
    if (!r.collapsed) return this.deleteSelection();
    const info = r.infos[r.startIndex]!;
    const text = textOf(info.block);
    if (r.start.offset > 0) {
      const from = previousBoundary(text, r.start.offset);
      return this.run("Apagar", [deleteText({ blockId: info.block.id, start: from, end: r.start.offset })], "typing").ok;
    }
    if (info.container === "top" && info.topIndex > 0) {
      const prev = this.document.content[info.topIndex - 1]!;
      if (prev.type === "paragraph" || prev.type === "heading") return this.run("Mesclar parágrafos", [mergeBlockWithPrevious({ blockId: info.block.id })], "structural").ok;
      return false;
    }
    if (info.container !== "top") this.notify("info", "Mesclar com o bloco anterior só é suportado para parágrafos e títulos de nível superior.");
    return false;
  }

  deleteForward(): boolean {
    const r = this.range();
    if (!r) return false;
    if (!r.collapsed) return this.deleteSelection();
    const info = r.infos[r.startIndex]!;
    const text = textOf(info.block);
    if (r.start.offset < text.length) {
      const to = nextBoundary(text, r.start.offset);
      return this.run("Apagar à frente", [deleteText({ blockId: info.block.id, start: r.start.offset, end: to })], "typing").ok;
    }
    if (info.container === "top") {
      const next = this.document.content[info.topIndex + 1];
      if (next && (next.type === "paragraph" || next.type === "heading")) return this.run("Mesclar parágrafos", [mergeBlockWithPrevious({ blockId: next.id })], "structural").ok;
    }
    return false;
  }

  deleteSelection(): boolean {
    const r = this.range();
    if (!r || r.collapsed) return false;
    const cmds = this.deleteRangeCommands(r);
    if (!cmds) return false;
    return this.run("Apagar seleção", cmds, "structural").ok;
  }

  splitAtCaret(): boolean {
    const r = this.range();
    if (!r) return false;
    const info = r.infos[r.startIndex]!;
    const cmds: Command[] = [];
    let blockId = info.block.id;
    let offset = r.start.offset;
    if (!r.collapsed) {
      const del = this.deleteRangeCommands(r);
      if (!del) return false;
      cmds.push(...del);
    }
    const startInfo = info;
    if (startInfo.container === "top") {
      cmds.push(splitBlock({ blockId, offset }));
      return this.run("Novo parágrafo", cmds, "structural").ok;
    }
    if (startInfo.container === "listItem" && startInfo.listId && startInfo.itemId) {
      cmds.push(splitListItem({ listId: startInfo.listId, itemId: startInfo.itemId, blockId, offset }));
      return this.run("Dividir item de lista", cmds, "structural").ok;
    }
    void blockId;
    void offset;
    this.notify("info", "Quebra de parágrafo dentro de tabelas e citações ainda não é suportada pelo motor.");
    return false;
  }

  /** Pastes plain text; line breaks become new paragraphs where the engine supports splitting. */
  insertPlainText(text: string): boolean {
    const normalized = text.replace(/\r\n?/g, "\n");
    const lines = normalized.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (i > 0 && !this.splitAtCaret()) return false;
      const line = lines[i]!;
      if (line.length > 0 && !this.insertText(line)) return false;
    }
    return true;
  }

  // ───────────────────────────── formatting ─────────────────────────────
  private segments(r: NonNullable<ReturnType<PreviewController["range"]>>): { id: string; start: number; end: number; info: TextBlockInfo }[] {
    const out: { id: string; start: number; end: number; info: TextBlockInfo }[] = [];
    for (let i = r.startIndex; i <= r.endIndex; i++) {
      const info = r.infos[i]!;
      const len = textOf(info.block).length;
      const start = i === r.startIndex ? r.start.offset : 0;
      const end = i === r.endIndex ? r.end.offset : len;
      if (end > start) out.push({ id: info.block.id, start, end, info });
    }
    return out;
  }

  /** True when every character of the selection already carries a mark of this type. */
  isMarkActive(type: MarkType): boolean {
    const r = this.range();
    if (!r || r.collapsed) return false;
    const segs = this.segments(r);
    if (segs.length === 0) return false;
    return segs.every((s) => {
      let pos = 0;
      for (const run of s.info.block.children) {
        const runStart = pos;
        const runEnd = pos + run.text.length;
        pos = runEnd;
        if (runEnd <= s.start || runStart >= s.end) continue;
        if (!run.marks.some((m) => m.type === type)) return false;
      }
      return true;
    });
  }

  toggleMark(mark: Mark): boolean {
    const r = this.range();
    if (!r || r.collapsed) {
      this.notify("info", "Selecione um trecho de texto para aplicar formatação.");
      return false;
    }
    const segs = this.segments(r);
    if (segs.length === 0) return false;
    const active = this.isMarkActive(mark.type);
    const cmds = segs.map((s) => (active ? removeMark({ blockId: s.id, start: s.start, end: s.end, markType: mark.type }) : applyMark({ blockId: s.id, start: s.start, end: s.end, mark })));
    return this.run(`${active ? "Remover" : "Aplicar"} ${mark.type}`, cmds, "formatting", this.editor.getSelection()).ok;
  }

  /** Applies a value mark (color, highlight, fontSize, fontFamily) without toggling. */
  setMark(mark: Mark): boolean {
    const r = this.range();
    if (!r || r.collapsed) {
      this.notify("info", "Selecione um trecho de texto para aplicar formatação.");
      return false;
    }
    const cmds = this.segments(r).map((s) => applyMark({ blockId: s.id, start: s.start, end: s.end, mark }));
    if (cmds.length === 0) return false;
    return this.run(`Aplicar ${mark.type}`, cmds, "formatting", this.editor.getSelection()).ok;
  }

  clearMark(type: MarkType): boolean {
    const r = this.range();
    if (!r || r.collapsed) return false;
    const cmds = this.segments(r).map((s) => removeMark({ blockId: s.id, start: s.start, end: s.end, markType: type }));
    if (cmds.length === 0) return false;
    return this.run(`Remover ${type}`, cmds, "formatting", this.editor.getSelection()).ok;
  }

  private selectedInfos(): TextBlockInfo[] {
    const r = this.range();
    return r ? r.infos.slice(r.startIndex, r.endIndex + 1) : [];
  }

  setAlignment(align: Alignment): boolean {
    const infos = this.selectedInfos();
    if (infos.length === 0) return false;
    return this.run("Alinhamento", infos.map((i) => setAlign({ blockId: i.block.id, align })), "formatting", this.editor.getSelection()).ok;
  }

  setBlockType(level: 1 | 2 | 3 | 4 | 5 | 6 | "paragraph"): boolean {
    const infos = this.selectedInfos().filter((i) => i.container === "top");
    if (infos.length === 0) {
      this.notify("info", "Títulos só podem ser definidos em blocos de nível superior (fora de listas, tabelas e citações).");
      return false;
    }
    return this.run("Tipo de bloco", infos.map((i) => setHeadingLevel({ blockId: i.block.id, level })), "structural", this.editor.getSelection()).ok;
  }

  currentBlockType(): string {
    const r = this.range();
    if (!r) return "paragraph";
    const b = r.infos[r.startIndex]!.block;
    return b.type === "heading" ? `h${b.level}` : "paragraph";
  }

  // ───────────────────────────── structures ─────────────────────────────
  private anchorTopId(): string | undefined {
    const r = this.range();
    if (!r) return this.document.content[this.document.content.length - 1]?.id;
    const top = this.document.content[r.infos[r.endIndex]!.topIndex];
    return top?.id;
  }

  insertListBlock(ordered: boolean): boolean {
    const r = this.range();
    if (!r) return false;
    const info = r.infos[r.startIndex]!;
    if (info.container === "top" && (info.block.type === "paragraph" || info.block.type === "heading")) {
      return this.run(ordered ? "Converter em lista ordenada" : "Converter em lista com marcadores", [convertBlockToList({ blockId: info.block.id, ordered })], "structural").ok;
    }
    if (info.container === "listItem" && info.listId) {
      return this.run(ordered ? "Converter para lista ordenada" : "Converter para lista com marcadores", [convertListType({ listId: info.listId, ordered })], "structural").ok;
    }
    this.notify("info", "Selecione um parágrafo ou item de lista para alterar seu tipo.");
    return false;
  }
  insertQuote(): boolean {
    const r = this.range();
    if (!r) return false;
    const info = r.infos[r.startIndex]!;
    if (info.container !== "top") {
      this.notify("info", "Selecione um parágrafo de nível superior para convertê-lo em citação.");
      return false;
    }
    return this.run("Citação", [convertBlockToBlockquote({ blockId: info.block.id })], "structural").ok;
  }
  insertRule(): boolean {
    const id = this.anchorTopId();
    return id ? this.run("Separador", [insertThematicBreak({ afterBlockId: id })], "structural").ok : false;
  }
  insertTableBlock(rows: number, columns: number): boolean {
    const id = this.anchorTopId();
    return id ? this.run(`Tabela ${rows}×${columns}`, [insertTable({ afterBlockId: id, rows, columns })], "structural").ok : false;
  }

  /** Context of the caret when it is inside a table cell, else undefined. */
  tableContext(): { tableId: string; rowId: string; cellId: string; columnIndex: number } | undefined {
    const r = this.range();
    if (!r) return undefined;
    const info = r.infos[r.startIndex]!;
    if (info.container !== "tableCell" || !info.tableId || !info.rowId || !info.cellId) return undefined;
    const table = this.document.content.find((b) => b.id === info.tableId);
    if (!table || table.type !== "table") return undefined;
    const row = table.children.find((x) => x.id === info.rowId);
    const columnIndex = row ? row.children.findIndex((c) => c.id === info.cellId) : -1;
    return { tableId: info.tableId, rowId: info.rowId, cellId: info.cellId, columnIndex };
  }

  tableAction(action: "addRow" | "removeRow" | "addColumn" | "removeColumn"): boolean {
    const ctx = this.tableContext();
    if (!ctx) {
      this.notify("info", "Posicione o cursor dentro de uma célula de tabela.");
      return false;
    }
    const cmd =
      action === "addRow" ? addTableRow({ tableId: ctx.tableId, afterRowId: ctx.rowId })
      : action === "removeRow" ? removeTableRow({ tableId: ctx.tableId, rowId: ctx.rowId })
      : action === "addColumn" ? addTableColumn({ tableId: ctx.tableId, afterColumnIndex: ctx.columnIndex })
      : removeTableColumn({ tableId: ctx.tableId, columnIndex: ctx.columnIndex });
    const labels = { addRow: "Adicionar linha", removeRow: "Remover linha", addColumn: "Adicionar coluna", removeColumn: "Remover coluna" } as const;
    const first = this.range();
    const anchorTop = first ? this.document.content[first.infos[first.startIndex]!.topIndex]?.id : undefined;
    const ok = this.run(labels[action], [cmd], "structural").ok;
    if (ok && anchorTop) {
      const still = this.textBlocks().find((i) => i.tableId === ctx.tableId);
      if (still) this.editor.setSelection({ anchor: { blockId: still.block.id, offset: 0 }, focus: { blockId: still.block.id, offset: 0 } });
      this.emit();
    }
    return ok;
  }

  insertImageFile(file: { name: string; mimeType: string; base64: string; alt?: string }): boolean {
    const id = this.anchorTopId();
    if (!id) return false;
    const added = this.editor.addResource({ kind: "image", mimeType: file.mimeType, data: file.base64, name: file.name });
    if (!added.ok) {
      this.fail(added.error);
      return false;
    }
    const placed = this.run("Imagem", [insertImage({ afterBlockId: id, resourceId: added.value.id, alt: file.alt ?? file.name })], "structural");
    if (!placed.ok) {
      this.editor.removeResource(added.value.id);
      this.emit();
      return false;
    }
    return true;
  }

  removeImageBlock(blockId: string): boolean {
    return this.run("Remover imagem", [removeImage({ blockId })], "structural").ok;
  }

  togglePageOrientation(): boolean {
    const page = this.document.pageConfig;
    const landscape = page.orientation === "portrait";
    return this.run("Orientação da página", [setPageConfig({ pageConfig: { orientation: landscape ? "landscape" : "portrait", width: page.height, height: page.width } })], "structural").ok;
  }

  // ───────────────────────────── history ─────────────────────────────
  undo(): boolean {
    const t0 = this.timer();
    const ok = this.editor.undo();
    if (ok) this.metrics = { ...this.computeMetrics("Desfazer", this.timer() - t0), lastValidateMs: this.metrics.lastValidateMs, lastSerializeMs: this.metrics.lastSerializeMs, lastParseMs: this.metrics.lastParseMs, serializedBytes: this.metrics.serializedBytes };
    this.emit();
    return ok;
  }
  redo(): boolean {
    const t0 = this.timer();
    const ok = this.editor.redo();
    if (ok) this.metrics = { ...this.computeMetrics("Refazer", this.timer() - t0), lastValidateMs: this.metrics.lastValidateMs, lastSerializeMs: this.metrics.lastSerializeMs, lastParseMs: this.metrics.lastParseMs, serializedBytes: this.metrics.serializedBytes };
    this.emit();
    return ok;
  }

  // ───────────────────────────── documents & files ─────────────────────────────
  private makeEditor(): Editor {
    return createEditor({
      idGenerator: this.generateId,
      clock: this.clock,
      onListenerError: (error, event) => this.notices.push({ id: ++this.noticeSeq, kind: "error", text: `Falha em um listener (${event}).`, detail: String(error), at: this.clock() }),
    });
  }

  newDocument(): void {
    this.editor.dispose();
    this.editor = this.makeEditor();
    this.cleanSnapshot = this.editor.getDocument();
    this.fileNameValue = "sem-titulo.nsx";
    this.lastSerialization = undefined;
    const first = this.textBlocks()[0];
    if (first) this.editor.setSelection({ anchor: { blockId: first.block.id, offset: 0 }, focus: { blockId: first.block.id, offset: 0 } });
    this.metrics = this.computeMetrics("Novo documento", 0);
    this.notify("info", "Novo documento criado.");
  }

  /** Replaces the current document with `doc` (fixtures, importers). Rejected documents leave the session untouched. */
  loadDocument(doc: NexusDocument, name: string): boolean {
    const result = this.editor.load(doc);
    if (!result.ok) {
      this.fail(result.error);
      return false;
    }
    this.afterOpen(name, "Documento carregado");
    return true;
  }

  openFromText(text: string, name: string): boolean {
    const t0 = this.timer();
    const result = this.editor.open(text);
    const ms = this.timer() - t0;
    if (!result.ok) {
      const d = describe(result.error);
      this.notify("error", `Não foi possível abrir "${name}": ${d.text}`, d.detail);
      return false;
    }
    this.afterOpen(name, "Arquivo .nsx aberto");
    this.metrics = { ...this.metrics, lastParseMs: ms, serializedBytes: new TextEncoder().encode(text).length };
    this.emit();
    return true;
  }

  private afterOpen(name: string, label: string): void {
    this.cleanSnapshot = this.editor.getDocument();
    this.fileNameValue = name;
    const first = this.textBlocks()[0];
    if (first) this.editor.setSelection({ anchor: { blockId: first.block.id, offset: 0 }, focus: { blockId: first.block.id, offset: 0 } });
    this.metrics = this.computeMetrics(label, 0);
    this.notify("success", `${label}: ${name} (${this.document.content.length} blocos, ${this.metrics.nodeCount} nós).`);
  }

  /** Serializes the current document to `.nsx` text. Nothing is claimed as saved here. */
  serialize(): Result<string> {
    const t0 = this.timer();
    const result = this.editor.serialize();
    const ms = this.timer() - t0;
    if (!result.ok) {
      this.fail(result.error);
      return result;
    }
    this.lastSerialization = result.value;
    this.metrics = { ...this.metrics, lastSerializeMs: ms, serializedBytes: new TextEncoder().encode(result.value).length };
    this.emit();
    return result;
  }

  /** Called by the host only after it actually handed the bytes to the browser/OS. */
  markExported(name: string, bytes: number): void {
    this.cleanSnapshot = this.editor.getDocument();
    this.fileNameValue = name;
    this.notify("success", `Arquivo "${name}" gerado (${bytes} bytes) e entregue ao navegador para download. O navegador decide onde ele é gravado.`);
  }

  validateNow(): { ok: boolean; issues: ValidationIssue[] } {
    const t0 = this.timer();
    const issues = this.editor.getValidationIssues();
    const ms = this.timer() - t0;
    this.metrics = { ...this.metrics, lastValidateMs: ms };
    if (issues.length === 0) this.notify("success", `Validação concluída em ${ms.toFixed(2)} ms: nenhum problema encontrado.`);
    else this.notify("error", `Validação encontrou ${issues.length} problema(s).`, JSON.stringify(issues, null, 2));
    return { ok: issues.length === 0, issues };
  }

  /** document → .nsx → document, compared structurally. Does not touch the open document. */
  roundTrip(): { ok: boolean; equal: boolean } {
    const doc = this.document;
    const saved = saveNsx(doc);
    if (!saved.ok) {
      this.fail(saved.error);
      return { ok: false, equal: false };
    }
    const reopened = openNsx(saved.value);
    if (!reopened.ok) {
      this.fail(reopened.error);
      return { ok: false, equal: false };
    }
    const equal = JSON.stringify(reopened.value) === JSON.stringify(doc);
    if (equal) this.notify("success", `Round-trip .nsx preservou o documento (${saved.value.length} caracteres).`);
    else this.notify("error", "Round-trip .nsx alterou o documento (a normalização reescreveu partes da estrutura).", "O documento aberto difere do original após normalização.");
    return { ok: true, equal };
  }

  dispose(): void {
    this.editor.dispose();
    this.listeners.clear();
  }
}

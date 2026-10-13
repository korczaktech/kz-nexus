import {
  applyMark,
  createEditor,
  createFixedClock,
  createIdGenerator,
  insertList,
  insertParagraphAfter,
  insertTable,
  insertText,
  insertThematicBreak,
  insertBlockquote,
  saveNsx,
  setAlign,
  setCellText,
  setHeadingLevel,
  type Block,
  type Command,
  type NexusDocument,
} from "@korczak/nexus-engine";

export interface DocumentFixture {
  kind: "document";
  id: string;
  label: string;
  build(): NexusDocument;
}
export interface RawFixture {
  kind: "raw";
  id: string;
  label: string;
  /** Raw .nsx text that the engine is EXPECTED to reject. */
  build(): string;
}
export type Fixture = DocumentFixture | RawFixture;

function session(seed: number) {
  const { now } = createFixedClock(1_700_000_000_000);
  return createEditor({ idGenerator: createIdGenerator("fx", seed), clock: now });
}

function firstBlockId(blocks: readonly Block[]): string {
  const first = blocks[0];
  if (!first) throw new Error("fixture: empty document");
  return first.id;
}

function must(result: { ok: boolean }, what: string): void {
  if (!result.ok) throw new Error(`fixture build failed at: ${what}`);
}

function basic(): NexusDocument {
  const e = session(1);
  const id = firstBlockId(e.getDocument().content);
  const doc = () => e.getDocument();
  must(e.exec([insertText({ blockId: id, offset: 0, text: "Relatório trimestral" })]), "title text");
  must(e.exec([setHeadingLevel({ blockId: id, level: 1 })]), "h1");
  must(e.exec([insertParagraphAfter({ blockId: id })]), "p2");
  const p2 = doc().content[1]!.id;
  must(e.exec([insertText({ blockId: p2, offset: 0, text: "Este documento foi gerado pelo próprio motor Korczak Nexus, sem HTML intermediário." })]), "p2 text");
  return doc();
}

function formatting(): NexusDocument {
  const e = session(2);
  const id = firstBlockId(e.getDocument().content);
  const text = "Negrito, itálico, sublinhado, tachado, cor e destaque no mesmo parágrafo.";
  must(e.exec([insertText({ blockId: id, offset: 0, text })]), "text");
  const cmds: Command[] = [
    applyMark({ blockId: id, start: 0, end: 7, mark: { type: "bold" } }),
    applyMark({ blockId: id, start: 9, end: 15, mark: { type: "italic" } }),
    applyMark({ blockId: id, start: 17, end: 28, mark: { type: "underline" } }),
    applyMark({ blockId: id, start: 30, end: 37, mark: { type: "strike" } }),
    applyMark({ blockId: id, start: 41, end: 44, mark: { type: "color", value: "#d9362b" } }),
    applyMark({ blockId: id, start: 47, end: 54, mark: { type: "highlight", value: "#fff3a3" } }),
    applyMark({ blockId: id, start: 0, end: 7, mark: { type: "fontSize", value: 20 } }),
  ];
  must(e.exec(cmds), "marks");
  must(e.exec([setAlign({ blockId: id, align: "center" })]), "align");
  return e.getDocument();
}

function structures(): NexusDocument {
  const e = session(3);
  const id = firstBlockId(e.getDocument().content);
  must(e.exec([insertText({ blockId: id, offset: 0, text: "Listas, citação, separador e tabela" })]), "text");
  must(e.exec([setHeadingLevel({ blockId: id, level: 2 })]), "h2");
  must(e.exec([insertList({ afterBlockId: id, ordered: false })]), "list");
  const listParagraph = e.getSelection()!.anchor.blockId;
  must(e.exec([insertText({ blockId: listParagraph, offset: 0, text: "Item de lista com marcador" })]), "item text");
  const afterList = e.getDocument().content[1]!.id;
  must(e.exec([insertBlockquote({ afterBlockId: afterList })]), "quote");
  const quoteParagraph = e.getSelection()!.anchor.blockId;
  must(e.exec([insertText({ blockId: quoteParagraph, offset: 0, text: "Uma citação dentro do documento." })]), "quote text");
  const quoteId = e.getDocument().content[2]!.id;
  must(e.exec([insertThematicBreak({ afterBlockId: quoteId })]), "hr");
  const hrId = e.getDocument().content[3]!.id;
  must(e.exec([insertTable({ afterBlockId: hrId, rows: 2, columns: 2 })]), "table");
  const table = e.getDocument().content[4];
  if (!table || table.type !== "table") throw new Error("fixture: table missing");
  const cmds: Command[] = [];
  table.children.forEach((row, r) =>
    row.children.forEach((cell, c) => cmds.push(setCellText({ tableId: table.id, rowId: row.id, cellId: cell.id, text: `L${r + 1}C${c + 1}` }))),
  );
  must(e.exec(cmds), "cells");
  return e.getDocument();
}

function unicode(): NexusDocument {
  const e = session(4);
  const id = firstBlockId(e.getDocument().content);
  must(e.exec([insertText({ blockId: id, offset: 0, text: "Acentuação: ação, coração, órgão, açaí, pão de queijo 🇧🇷 😀 e\u0301 (e + acento combinante)" })]), "text");
  return e.getDocument();
}

function large(): NexusDocument {
  const e = session(5);
  const id = firstBlockId(e.getDocument().content);
  must(e.exec([insertText({ blockId: id, offset: 0, text: "Parágrafo 1 — documento grande para medir desempenho." })]), "first paragraph");
  for (let i = 2; i <= 400; i++) {
    const lastId = e.getDocument().content[e.getDocument().content.length - 1]!.id;
    must(e.exec([insertParagraphAfter({ blockId: lastId })]), `paragraph ${i}`);
    const newId = e.getDocument().content[e.getDocument().content.length - 1]!.id;
    must(e.exec([insertText({ blockId: newId, offset: 0, text: `Parágrafo ${i}: Lorem ipsum dolor sit amet, consectetur adipiscing elit, açaí e café.` })]), `text ${i}`);
  }
  return e.getDocument();
}

function validSerialized(): string {
  const saved = saveNsx(structures());
  if (!saved.ok) throw new Error("fixture: could not serialize");
  return saved.value;
}

export const FIXTURES: Fixture[] = [
  { kind: "document", id: "basic", label: "Básico (título + parágrafo)", build: basic },
  { kind: "document", id: "formatting", label: "Formatação (marcas e alinhamento)", build: formatting },
  { kind: "document", id: "structures", label: "Estruturas (lista, citação, tabela)", build: structures },
  { kind: "document", id: "unicode", label: "Unicode (acentos, emoji, combinantes)", build: unicode },
  { kind: "document", id: "large", label: "Grande (400 parágrafos)", build: large },
  { kind: "raw", id: "bad-truncated", label: "Inválido: arquivo truncado", build: () => validSerialized().slice(0, 120) },
  { kind: "raw", id: "bad-format", label: "Inválido: formato desconhecido", build: () => JSON.stringify({ format: "outro-formato", formatVersion: 1, document: {} }) },
  { kind: "raw", id: "bad-future", label: "Inválido: versão futura (99)", build: () => JSON.stringify({ format: "korczak-nexus", formatVersion: 99, document: {} }) },
  {
    kind: "raw",
    id: "bad-duplicate-ids",
    label: "Inválido: ids duplicados",
    build: () => {
      const env = JSON.parse(validSerialized()) as { document: { content: { id: string }[] } };
      const first = env.document.content[0]!;
      env.document.content[1]!.id = first.id;
      return JSON.stringify(env);
    },
  },
];

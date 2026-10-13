// Measures engine operations on documents of several sizes. Results depend on the machine; see docs/PERFORMANCE.md.
import { performance } from "node:perf_hooks";
import {
  applyMark, createEditor, createIdGenerator, importPlainText, insertText, normalizeDocument, openNsx, saveNsx, splitBlock, systemClock, validateDocument,
} from "@korczak/nexus-engine";

const SIZES = [["pequeno", 10], ["médio", 500], ["grande", 5000]];
const lineText = (i) => `Parágrafo ${i}: Lorem ipsum dolor sit amet, consectetur adipiscing elit, açaí e café.`;
const time = (fn, runs = 5) => { const t = []; let out; for (let i = 0; i < runs; i++) { const s = performance.now(); out = fn(); t.push(performance.now() - s); } t.sort((a, b) => a - b); return { ms: t[Math.floor(t.length / 2)], out }; };
const rows = [];
for (const [label, n] of SIZES) {
  const text = Array.from({ length: n }, (_, i) => lineText(i + 1)).join("\n");
  const gen = createIdGenerator("b", 1);
  const create = time(() => importPlainText(text, gen, systemClock), 3);
  const doc = create.out;
  const validate = time(() => validateDocument(doc));
  const normalize = time(() => normalizeDocument(doc, createIdGenerator("z", 1)));
  const ser = time(() => saveNsx(doc));
  const bytes = Buffer.byteLength(ser.out.value);
  const parse = time(() => openNsx(ser.out.value));
  const editor = createEditor({ idGenerator: createIdGenerator("e", 2) });
  editor.load(doc);
  const mid = doc.content[Math.floor(n / 2)].id;
  const insert = time(() => editor.exec([insertText({ blockId: mid, offset: 3, text: "x" })]), 7);
  const mark = time(() => editor.exec([applyMark({ blockId: mid, start: 0, end: 10, mark: { type: "bold" } })]), 7);
  const split = time(() => editor.exec([splitBlock({ blockId: mid, offset: 5 })]), 3);
  const undo = time(() => { editor.undo(); editor.redo(); }, 5);
  rows.push({ documento: `${label} (${n} parágrafos)`, "bytes .nsx": bytes, criar: create.ms, validar: validate.ms, normalizar: normalize.ms, "inserir texto": insert.ms, "aplicar negrito": mark.ms, "dividir parágrafo": split.ms, "undo+redo": undo.ms, serializar: ser.ms, ler: parse.ms });
}
const fmt = (v) => (typeof v === "number" && !Number.isInteger(v) ? v.toFixed(2) : v);
console.log(`node ${process.version}, ${process.platform}/${process.arch}; mediana em ms`);
console.log(Object.keys(rows[0]).join(" | "));
for (const r of rows) console.log(Object.values(r).map(fmt).join(" | "));

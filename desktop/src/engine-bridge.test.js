import test from "node:test";
import assert from "node:assert/strict";
import { htmlToNexusDocument, exportNexusFile, importNexusFile, nexusDocumentToHtml, layoutNexusDocument } from "./engine-bridge.js";

test("documento HTML usa o núcleo Kortex e gera geometria de páginas", () => {
  const document = htmlToNexusDocument("<h1>Contrato</h1><p>Olá <strong>Nexus</strong>.</p><ul><li><p>Item</p></li></ul>", "Contrato");
  const layout = layoutNexusDocument(document);
  assert.ok(document.content.length >= 3);
  assert.ok(layout.pageCount >= 1);
  assert.ok(layout.pages[0].blocks.length >= 1);
});

test("formato NSX faz round-trip validado pelo núcleo compartilhado", () => {
  const source = htmlToNexusDocument("<h1>Relatório</h1><p>Conteúdo <em>importante</em>.</p>", "Relatório");
  const serialized = exportNexusFile(source);
  const restored = importNexusFile(serialized);
  assert.equal(restored.metadata.title, "Relatório");
  assert.match(nexusDocumentToHtml(restored), /Relatório/);
  assert.match(nexusDocumentToHtml(restored), /importante/);
});

test("formato NSX rejeita arquivo corrompido sem substituir o documento", () => {
  assert.throws(() => importNexusFile("{ inválido"), /JSON|valid|File/i);
});

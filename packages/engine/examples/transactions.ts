import assert from "node:assert/strict";
import { createEditor, insertText } from "@korczak/nexus-engine";

const editor = createEditor();
const id = editor.getDocument().content[0]!.id;
const before = JSON.stringify(editor.getDocument());
const result = editor.exec([insertText({ blockId: id, offset: 0, text: "parcial" }), insertText({ blockId: "n_inexistente", offset: 0, text: "x" })]);
assert.equal(result.ok, false);
assert.equal(JSON.stringify(editor.getDocument()), before);
console.log("transactions: rejected atomically ->", result.ok ? "?" : result.error.code);

import assert from "node:assert/strict";
import { createEditor, insertText, getPlainText } from "@korczak/nexus-engine";

const editor = createEditor();
const first = editor.getDocument().content[0];
assert.ok(first);
const result = editor.exec([insertText({ blockId: first.id, offset: 0, text: "Olá, Nexus" })]);
assert.equal(result.ok, true);
const block = editor.getDocument().content[0];
assert.ok(block && block.type === "paragraph");
console.log("basic-document:", getPlainText(block));

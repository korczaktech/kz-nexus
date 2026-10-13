import assert from "node:assert/strict";
import { createEditor, insertText, saveNsx, openNsx } from "@korczak/nexus-engine";

const editor = createEditor();
editor.exec([insertText({ blockId: editor.getDocument().content[0]!.id, offset: 0, text: "Açaí 😀" })]);
const saved = saveNsx(editor.getDocument());
assert.ok(saved.ok);
const reopened = openNsx(saved.value);
assert.ok(reopened.ok);
assert.deepEqual(reopened.value, editor.getDocument());
console.log("nsx-roundtrip: ok,", saved.value.length, "characters");

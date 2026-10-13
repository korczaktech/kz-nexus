import assert from "node:assert/strict";
import { createEditor, insertText, splitBlock } from "@korczak/nexus-engine";

const editor = createEditor();
const id = editor.getDocument().content[0]!.id;
editor.exec([insertText({ blockId: id, offset: 0, text: "um dois" })]);
editor.exec([splitBlock({ blockId: id, offset: 2 })]);
assert.equal(editor.getDocument().content.length, 2);
editor.undo();
assert.equal(editor.getDocument().content.length, 1);
editor.redo();
assert.equal(editor.getDocument().content.length, 2);
console.log("history: undo/redo ok", editor.getHistoryInfo());

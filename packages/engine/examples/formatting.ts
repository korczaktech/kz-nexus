import assert from "node:assert/strict";
import { createEditor, insertText, applyMark, setAlign } from "@korczak/nexus-engine";

const editor = createEditor();
const id = editor.getDocument().content[0]!.id;
editor.exec([insertText({ blockId: id, offset: 0, text: "negrito e centralizado" })]);
editor.exec([applyMark({ blockId: id, start: 0, end: 7, mark: { type: "bold" } }), setAlign({ blockId: id, align: "center" })]);
const block = editor.getDocument().content[0]!;
assert.ok(block.type === "paragraph");
assert.equal(block.align, "center");
assert.ok(block.children[0]!.marks.some((m) => m.type === "bold"));
console.log("formatting: runs =", block.children.map((r) => `${JSON.stringify(r.text)}[${r.marks.map((m) => m.type)}]`).join(" "));

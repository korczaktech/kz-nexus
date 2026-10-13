import assert from "node:assert/strict";
import { createEditor, createIdGenerator, systemClock, insertText, insertTable, exportPlainText, importPlainText } from "@korczak/nexus-engine";

// Everything below runs in plain Node: no DOM, no window, no UI framework.
const editor = createEditor();
const id = editor.getDocument().content[0]!.id;
editor.exec([insertText({ blockId: id, offset: 0, text: "Título" })]);
editor.exec([insertTable({ afterBlockId: id, rows: 2, columns: 2 })]);
const events: string[] = [];
const off = editor.on("documentChanged", () => events.push("changed"));
editor.exec([insertText({ blockId: id, offset: 0, text: ">" })]);
off();
editor.exec([insertText({ blockId: id, offset: 0, text: ">" })]);
assert.equal(events.length, 1);
const imported = importPlainText("a\nb", createIdGenerator("n"), systemClock);
assert.equal(exportPlainText(imported), "a\nb");
console.log("headless-usage: events =", events.length, "| text =", JSON.stringify(exportPlainText(editor.getDocument())));

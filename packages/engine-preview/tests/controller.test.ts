// Integration tests: the preview controller driving the REAL engine through its public package.
import { describe, expect, it } from "vitest";
import * as engine from "@korczak/nexus-engine";
import { PreviewController } from "../src/services/controller";
import { FIXTURES } from "../src/fixtures/builtin";
import { collectTextBlocks, textOf } from "../src/services/model-utils";

function newController() {
  const { now } = engine.createFixedClock(5_000);
  let t = 0;
  return new PreviewController({ idGenerator: engine.createIdGenerator("t", 11), clock: now, timer: () => (t += 1) });
}
const textAll = (c: PreviewController) => collectTextBlocks(c.document).map((i) => textOf(i.block));
function caretAt(c: PreviewController, index: number, offset: number) {
  const info = collectTextBlocks(c.document)[index]!;
  c.setSelection({ anchor: { blockId: info.block.id, offset }, focus: { blockId: info.block.id, offset } });
}
function select(c: PreviewController, a: [number, number], f: [number, number]) {
  const infos = collectTextBlocks(c.document);
  c.setSelection({ anchor: { blockId: infos[a[0]]!.block.id, offset: a[1] }, focus: { blockId: infos[f[0]]!.block.id, offset: f[1] } });
}

describe("preview ↔ engine integration", () => {
  it("uses the engine's public package entry point", () => {
    expect(typeof engine.createEditor).toBe("function");
    expect(typeof engine.saveNsx).toBe("function");
    expect(engine.NSX_FORMAT_ID).toBe("korczak-nexus");
  });

  it("typing changes the real engine document and the inspector data source", () => {
    const c = newController();
    expect(c.insertText("Olá")).toBe(true);
    expect(textAll(c)).toEqual(["Olá"]);
    expect(c.metrics.nodeCount).toBeGreaterThan(0);
    expect(JSON.stringify(c.document)).toContain("Olá");
    expect(c.validationIssues()).toEqual([]);
  });

  it("undo and redo walk through engine history", () => {
    const c = newController();
    c.insertText("um");
    c.splitAtCaret();
    c.insertText("dois");
    expect(textAll(c)).toEqual(["um", "dois"]);
    expect(c.undo()).toBe(true);
    expect(c.undo()).toBe(true);
    expect(textAll(c).join("|")).toBe("um");
    c.redo();
    c.redo();
    expect(textAll(c)).toEqual(["um", "dois"]);
  });

  it("backspace merges paragraphs and removes whole emoji", () => {
    const c = newController();
    c.insertText("ab");
    c.splitAtCaret();
    c.insertText("😀");
    expect(c.deleteBackward()).toBe(true);
    expect(textAll(c)).toEqual(["ab", ""]);
    expect(c.deleteBackward()).toBe(true);
    expect(textAll(c)).toEqual(["ab"]);
  });

  it("deletes a selection that spans paragraphs", () => {
    const c = newController();
    c.insertText("primeiro");
    c.splitAtCaret();
    c.insertText("segundo");
    select(c, [0, 3], [1, 3]);
    expect(c.deleteSelection()).toBe(true);
    expect(textAll(c)).toEqual(["priundo"]);
  });

  it("bold toggles across several blocks in one atomic, undoable step", () => {
    const c = newController();
    c.insertText("aaa");
    c.splitAtCaret();
    c.insertText("bbb");
    select(c, [0, 1], [1, 2]);
    expect(c.toggleMark({ type: "bold" })).toBe(true);
    expect(c.isMarkActive("bold")).toBe(true);
    c.toggleMark({ type: "bold" });
    expect(c.isMarkActive("bold")).toBe(false);
    c.undo();
    expect(c.isMarkActive("bold")).toBe(true);
  });

  it("Enter splits list items at the caret instead of only appending", () => {
    const c = newController();
    c.insertText("alpha");
    expect(c.insertListBlock(false)).toBe(true);
    const info = collectTextBlocks(c.document)[0]!;
    c.setSelection({ anchor: { blockId: info.block.id, offset: 2 }, focus: { blockId: info.block.id, offset: 2 } });
    expect(c.splitAtCaret()).toBe(true);
    expect(textAll(c)).toEqual(["al", "pha"]);
    const list = c.document.content.find(block => block.type === "bulletList");
    expect(list && list.type === "bulletList" ? list.children : []).toHaveLength(2);
    expect(c.validationIssues()).toEqual([]);
  });

  it("lists, quote, rule and tables are real engine structures", () => {
    const c = newController();
    c.insertText("x");
    expect(c.insertListBlock(true)).toBe(true);
    c.insertText("item");
    expect(c.splitAtCaret()).toBe(true);
    expect(c.document.content.some((b) => b.type === "orderedList")).toBe(true);
    expect(c.insertTableBlock(2, 2)).toBe(true);
    expect(c.document.content.some((b) => b.type === "table")).toBe(true);
    caretAt(c, collectTextBlocks(c.document).findIndex((i) => i.container === "tableCell"), 0);
    expect(c.tableAction("addRow")).toBe(true);
    expect(c.tableAction("addColumn")).toBe(true);
    const table = c.document.content.find((b) => b.type === "table");
    expect(table && table.type === "table" ? [table.children.length, table.children[0]!.children.length] : []).toEqual([3, 3]);
    expect(c.validationIssues()).toEqual([]);
  });

  it("images need a real resource and keep the document valid", () => {
    const c = newController();
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";
    expect(c.insertImageFile({ name: "pixel.png", mimeType: "image/png", base64: png })).toBe(true);
    expect(c.document.resources).toHaveLength(1);
    expect(c.document.content.some((b) => b.type === "image")).toBe(true);
    const before = JSON.stringify(c.document);
    expect(c.insertImageFile({ name: "x.exe", mimeType: "application/x-msdownload", base64: "AA==" })).toBe(false);
    expect(JSON.stringify(c.document)).toBe(before);
    expect(c.notices.at(-1)?.kind).toBe("error");
  });

  it("save produces a valid .nsx and opening it in a fresh session recovers the document", () => {
    const c = newController();
    c.insertText("Acentuação, açaí e 😀");
    const saved = c.serialize();
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const parsed = JSON.parse(saved.value) as { format: string; formatVersion: number };
    expect(parsed.format).toBe("korczak-nexus");
    expect(parsed.formatVersion).toBe(1);
    const other = newController();
    expect(other.openFromText(saved.value, "teste.nsx")).toBe(true);
    expect(JSON.stringify(other.document)).toBe(JSON.stringify(c.document));
    expect(other.fileName).toBe("teste.nsx");
  });

  it("round-trip preserves structure", () => {
    const c = newController();
    const fixture = FIXTURES.find((f) => f.id === "structures");
    if (!fixture || fixture.kind !== "document") throw new Error("fixture missing");
    expect(c.loadDocument(fixture.build(), "e.nsx")).toBe(true);
    expect(c.roundTrip()).toEqual({ ok: true, equal: true });
    expect(c.notices.at(-1)?.kind).toBe("success");
  });

  it("invalid files are rejected, never reported as success, and leave the document untouched", () => {
    for (const fixture of FIXTURES.filter((f) => f.kind === "raw")) {
      const c = newController();
      c.insertText("preservado");
      const before = JSON.stringify(c.document);
      const noticesBefore = c.notices.length;
      expect(c.openFromText(fixture.build() as string, `${fixture.id}.nsx`)).toBe(false);
      expect(JSON.stringify(c.document)).toBe(before);
      const added = c.notices.slice(noticesBefore);
      expect(added.length).toBe(1);
      expect(added[0]!.kind).toBe("error");
      expect(c.fileName).toBe("sem-titulo.nsx");
    }
  });

  it("future format versions are reported as incompatible, not opened", () => {
    const c = newController();
    c.openFromText(JSON.stringify({ format: "korczak-nexus", formatVersion: 99, document: {} }), "futuro.nsx");
    expect(c.notices.at(-1)?.text).toContain("VERSION_MISMATCH");
  });

  it("every built-in document fixture is valid and round-trips through .nsx", () => {
    for (const fixture of FIXTURES.filter((f) => f.kind === "document")) {
      const doc = (fixture as { build(): engine.NexusDocument }).build();
      expect(engine.validateDocument(doc).ok).toBe(true);
      const saved = engine.saveNsx(doc);
      expect(saved.ok).toBe(true);
      if (saved.ok) {
        const reopened = engine.openNsx(saved.value);
        expect(reopened.ok).toBe(true);
        if (reopened.ok) expect(reopened.value).toEqual(doc);
      }
    }
  });

  it("splits paragraphs inside table cells through the engine", () => {
    const c = newController();
    c.insertTableBlock(1, 1);
    const cellIndex = collectTextBlocks(c.document).findIndex((i) => i.container === "tableCell");
    caretAt(c, cellIndex, 0);
    c.insertText("cell text");
    caretAt(c, cellIndex, 4);
    expect(c.splitAtCaret()).toBe(true);
    const table = c.document.content.find(block => block.type === "table");
    expect(table && table.type === "table" ? table.children[0]!.children[0]!.children : []).toHaveLength(2);
    expect(c.validationIssues()).toEqual([]);
  });

  it("'exported' is only claimed when the host confirms the hand-off", () => {
    const c = newController();
    c.insertText("a");
    c.serialize();
    expect(c.notices.some((n) => n.kind === "success")).toBe(false);
    c.markExported("a.nsx", 10);
    expect(c.notices.at(-1)?.kind).toBe("success");
    expect(c.dirty).toBe(false);
  });
});

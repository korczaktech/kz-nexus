import { describe, expect, it } from "vitest";
import {
  createDocument,
  createIdGenerator,
  getPlainText,
} from "../../../packages/engine/src/index";
import {
  decodeNexusDocument,
  encodeNexusDocument,
  isNsxFilename,
  NSX_FILE_EXTENSION,
} from "./nexusDocumentPersistence";

describe("Kortex model persistence (.nsx)", () => {
  it("serializes the canonical model into the native envelope, not HTML", () => {
    const document = createDocument({ title: "Native model" });
    const result = encodeNexusDocument(document);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toContain('"format": "korczak-nexus"');
    expect(result.value).toContain('"formatVersion":');
    expect(result.value).toContain('"document":');
    expect(result.value).not.toMatch(/<\\/?(?:html|body|p|div)(?:\\s|>)/i);
  });

  it("round-trips the identity, metadata, page configuration, content and resources", () => {
    const document = createDocument({
      title: "Kortex source of truth",
      pageConfig: {
        width: 595.28,
        height: 841.89,
        orientation: "portrait",
        margins: { top: 48, right: 42, bottom: 48, left: 42 },
      },
    });
    const encoded = encodeNexusDocument(document);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;

    const decoded = decodeNexusDocument(encoded.value);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value).toEqual(document);
  });

  it("preserves Unicode and text exactly through a .nsx round trip", () => {
    const document = createDocument({ title: "Português — 日本語 — 😀" });
    const firstBlock = document.content[0];
    if (!firstBlock || firstBlock.type !== "paragraph") throw new Error("Expected default paragraph");
    firstBlock.children[0]!.text = "Ação, coração, 你好, 😀 e acentos combinados: e\\u0301";

    const encoded = encodeNexusDocument(document);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const decoded = decodeNexusDocument(encoded.value);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.metadata.title).toBe("Português — 日本語 — 😀");
    expect(getPlainText(decoded.value.content[0]!)).toBe(firstBlock.children[0]!.text);
  });

  it("rejects HTML, invalid JSON, and envelopes with the wrong format", () => {
    expect(decodeNexusDocument("<p>Not an NSX document</p>").ok).toBe(false);
    expect(decodeNexusDocument("{broken").ok).toBe(false);
    expect(decodeNexusDocument(JSON.stringify({ format: "other", formatVersion: 1, document: {} })).ok).toBe(false);
  });

  it("supports deterministic ID generation when decoding needs normalization", () => {
    const document = createDocument({ title: "Stable IDs" });
    const encoded = encodeNexusDocument(document);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;

    const first = decodeNexusDocument(encoded.value, { idGenerator: createIdGenerator("stable") });
    const second = decodeNexusDocument(encoded.value, { idGenerator: createIdGenerator("stable") });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value).toEqual(second.value);
  });

  it("recognizes only filenames with the native extension", () => {
    expect(NSX_FILE_EXTENSION).toBe(".nsx");
    expect(isNsxFilename("report.nsx")).toBe(true);
    expect(isNsxFilename("REPORT.NSX")).toBe(true);
    expect(isNsxFilename("C:\\\\docs\\\\report.nsx")).toBe(true);
    expect(isNsxFilename("/home/user/report.nsx")).toBe(true);
    expect(isNsxFilename("report.html")).toBe(false);
    expect(isNsxFilename(".nsx")).toBe(false);
    expect(isNsxFilename("report.nsx.bak")).toBe(false);
    expect(isNsxFilename("folder.nsx/report.txt")).toBe(false);
  });
});

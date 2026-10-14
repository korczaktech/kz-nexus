import { describe, expect, it } from "vitest";
import { createDocument, getPlainText } from "../../../packages/engine/src/index";
import {
  decodeNexusDocument,
  encodeNexusDocument,
  isNsxFilename,
  NSX_FILE_EXTENSION,
} from "./nexusDocumentPersistence";

describe("Kortex model persistence (.nsx)", () => {
  it("serializes the canonical document model directly, without HTML", () => {
    const document = createDocument({ title: "Native model" });
    const result = encodeNexusDocument(document);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toContain('"format": "korczak-nexus"');
    expect(result.value).toContain('"document"');
    expect(result.value).not.toContain("<html");
    expect(result.value).not.toContain("<p>");
  });

  it("round-trips document metadata, page configuration and content through .nsx", () => {
    const document = createDocument({ title: "Kortex source of truth" });
    const encoded = encodeNexusDocument(document);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;

    const decoded = decodeNexusDocument(encoded.value);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.metadata.title).toBe("Kortex source of truth");
    expect(decoded.value.pageConfig).toEqual(document.pageConfig);
    expect(decoded.value.content).toEqual(document.content);
    expect(decoded.value.id).toBe(document.id);
  });

  it("rejects invalid .nsx payloads rather than treating them as HTML", () => {
    const result = decodeNexusDocument("<p>Not an NSX document</p>");
    expect(result.ok).toBe(false);
  });

  it("recognizes the native extension case-insensitively", () => {
    expect(NSX_FILE_EXTENSION).toBe(".nsx");
    expect(isNsxFilename("report.nsx")).toBe(true);
    expect(isNsxFilename("REPORT.NSX")).toBe(true);
    expect(isNsxFilename("report.html")).toBe(false);
  });

  it("keeps the text available from the decoded canonical model", () => {
    const document = createDocument({ title: "Text check" });
    const encoded = encodeNexusDocument(document);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const decoded = decodeNexusDocument(encoded.value);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(getPlainText(decoded.value.content[0]!)).toBe("");
  });
});

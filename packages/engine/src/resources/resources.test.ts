import { describe, expect, it } from "vitest";
import { createIdGenerator } from "../core/ids";
import { createFixedClock } from "../core/clock";
import { createDocument } from "../commands/document";
import { insertImage } from "../commands/image";
import { addResource, removeResource } from "./resources";

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function ctx() {
  return createIdGenerator("id", 7);
}

describe("addResource / removeResource", () => {
  it("adds a valid image resource", () => {
    const doc = createDocument(createIdGenerator("n", 1), createFixedClock(0).now);
    const result = addResource(doc, { kind: "image", mimeType: "image/png", data: TINY_PNG_BASE64 }, ctx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.document.resources).toHaveLength(1);
      expect(result.value.resource.byteLength).toBeGreaterThan(0);
    }
  });

  it("rejects an unsupported mime type", () => {
    const doc = createDocument(createIdGenerator("n", 1), createFixedClock(0).now);
    const result = addResource(doc, { kind: "image", mimeType: "application/pdf", data: TINY_PNG_BASE64 }, ctx());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNSUPPORTED_FORMAT");
  });

  it("rejects a resource larger than the configured limit", () => {
    const doc = createDocument(createIdGenerator("n", 1), createFixedClock(0).now);
    const result = addResource(doc, { kind: "image", mimeType: "image/png", data: TINY_PNG_BASE64 }, ctx(), {
      maxDocumentBytes: 1,
      maxNodes: 1,
      maxTreeDepth: 1,
      maxTextRunLength: 1,
      maxResources: 1,
      maxResourceBytes: 1,
      maxMetadataEntries: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("LIMIT_EXCEEDED");
  });

  it("prevents removing a resource that is still referenced by an image block", () => {
    const doc = createDocument(createIdGenerator("n", 1), createFixedClock(0).now);
    const added = addResource(doc, { kind: "image", mimeType: "image/png", data: TINY_PNG_BASE64 }, ctx());
    if (!added.ok) throw added.error;
    const withImage = insertImage({ afterBlockId: doc.content[0].id, resourceId: added.value.resource.id, alt: "test" })(
      added.value.document,
      { generateId: ctx() },
    );
    if (!withImage.ok) throw withImage.error;

    const removal = removeResource(withImage.value.document, added.value.resource.id);
    expect(removal.ok).toBe(false);
    if (!removal.ok) expect(removal.error.code).toBe("RESOURCE_IN_USE");

    const forced = removeResource(withImage.value.document, added.value.resource.id, { force: true });
    expect(forced.ok).toBe(true);
  });

  it("fails to remove a resource that does not exist", () => {
    const doc = createDocument(createIdGenerator("n", 1), createFixedClock(0).now);
    const result = removeResource(doc, "n_missing1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("RESOURCE_NOT_FOUND");
  });
});

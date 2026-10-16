import type { NexusDocument, ResourceRef } from "../model/types";
import { DEFAULT_LIMITS, type EngineLimits } from "../schema/schema";
import { engineError } from "../errors/errors";
import { err, ok, type Result } from "../utils/result";
import { isValidId } from "../core/ids";

const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"]);

function base64ByteLength(base64: string): number {
  const clean = base64.replace(/=+$/, "");
  return Math.floor((clean.length * 3) / 4);
}

export interface AddResourceInput {
  id?: string;
  kind: "image";
  mimeType: string;
  /** Base64-encoded bytes supplied by the host (Section 10.4 — the engine never reads the filesystem). */
  data: string;
  name?: string;
}

export function addResource(
  doc: NexusDocument,
  input: AddResourceInput,
  generateId: () => string,
  limits: EngineLimits = DEFAULT_LIMITS,
): Result<{ document: NexusDocument; resource: ResourceRef }> {
  if (!ALLOWED_IMAGE_MIME_TYPES.has(input.mimeType)) {
    return err(engineError("UNSUPPORTED_FORMAT", `Unsupported resource mime type "${input.mimeType}"`));
  }
  const byteLength = base64ByteLength(input.data);
  if (byteLength > limits.maxResourceBytes) {
    return err(engineError("LIMIT_EXCEEDED", `Resource exceeds maxResourceBytes (${byteLength} > ${limits.maxResourceBytes})`));
  }
  if (doc.resources.length >= limits.maxResources) {
    return err(engineError("LIMIT_EXCEEDED", "Maximum number of resources reached"));
  }
  const id = input.id && isValidId(input.id) ? input.id : generateId();
  if (doc.resources.some((resource) => resource.id === id)) {
    return err(engineError("INVALID_DOCUMENT", `Resource id "${id}" already exists`));
  }
  const resource: ResourceRef = { id, kind: input.kind, mimeType: input.mimeType, data: input.data, byteLength, name: input.name };
  return ok({ document: { ...doc, resources: [...doc.resources, resource] }, resource });
}

function isResourceReferenced(doc: NexusDocument, resourceId: string): boolean {
  return doc.content.some(block => {
    if (block.type === "image") return block.resourceId === resourceId;
    if (block.type !== "table") return false;
    return block.children.some(row => row.children.some(cell => (cell.images ?? []).some(image => image.resourceId === resourceId)));
  });
}

export function removeResource(doc: NexusDocument, resourceId: string, options: { force?: boolean } = {}): Result<NexusDocument> {
  const exists = doc.resources.some((resource) => resource.id === resourceId);
  if (!exists) return err(engineError("RESOURCE_NOT_FOUND", `Resource "${resourceId}" not found`));
  if (!options.force && isResourceReferenced(doc, resourceId)) {
    return err(engineError("RESOURCE_IN_USE", `Resource "${resourceId}" is still referenced by an image block`));
  }
  return ok({ ...doc, resources: doc.resources.filter((resource) => resource.id !== resourceId) });
}

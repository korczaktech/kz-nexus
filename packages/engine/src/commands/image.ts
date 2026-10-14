import type { Block, ImageBlock } from "../model/types";
import { engineError } from "../errors/errors";
import { err, ok } from "../utils/result";
import type { Command } from "./types";
import { addResource } from "../resources/resources";

export function insertImage(params: { afterBlockId: string; resourceId: string; alt: string; width?: number; height?: number }): Command {
  return (doc, ctx) => {
    const index = doc.content.findIndex((block) => block.id === params.afterBlockId);
    if (index === -1) return err(engineError("NODE_NOT_FOUND", `Top-level block "${params.afterBlockId}" not found`, { path: params.afterBlockId }));
    if (!doc.resources.some((resource) => resource.id === params.resourceId)) {
      return err(engineError("RESOURCE_NOT_FOUND", `Resource "${params.resourceId}" not found`, { path: params.resourceId }));
    }
    const image: ImageBlock = {
      type: "image",
      id: ctx.generateId(),
      resourceId: params.resourceId,
      alt: params.alt,
      width: params.width,
      height: params.height,
    };
    const content: Block[] = [...doc.content];
    content.splice(index + 1, 0, image);
    return ok({ document: { ...doc, content } });
  };
}

/** Updates image alternative text and/or dimensions in the canonical document model. */
export function updateImage(params: { blockId: string; alt?: string; width?: number | null; height?: number | null }): Command {
  return (doc) => {
    const index = doc.content.findIndex((block) => block.id === params.blockId && block.type === "image");
    if (index < 0) return err(engineError("NODE_NOT_FOUND", `Image block "${params.blockId}" not found`, { path: params.blockId }));
    for (const [name, value] of [["width", params.width], ["height", params.height]] as const) {
      if (value !== undefined && value !== null && (!Number.isFinite(value) || value <= 0 || value > 2000)) {
        return err(engineError("INVALID_DOCUMENT", `${name} must be greater than 0 and at most 2000 pixels`, { path: params.blockId }));
      }
    }
    if (params.alt !== undefined && (typeof params.alt !== "string" || params.alt.length > 2000)) {
      return err(engineError("INVALID_DOCUMENT", "Image alternative text must be at most 2000 characters", { path: params.blockId }));
    }
    const image = doc.content[index];
    if (!image || image.type !== "image") return err(engineError("NODE_NOT_FOUND", `Image block "${params.blockId}" not found`, { path: params.blockId }));
    const content = [...doc.content];
    content[index] = {
      ...image,
      ...(params.alt !== undefined ? { alt: params.alt } : {}),
      ...(params.width !== undefined ? { width: params.width === null ? undefined : params.width } : {}),
      ...(params.height !== undefined ? { height: params.height === null ? undefined : params.height } : {}),
    };
    return ok({ document: { ...doc, content } });
  };
}

export function removeImage(params: { blockId: string }): Command {
  return (doc, ctx) => {
    const image = doc.content.find((block) => block.id === params.blockId && block.type === "image");
    if (!image || image.type !== "image") return err(engineError("NODE_NOT_FOUND", `Image block "${params.blockId}" not found`, { path: params.blockId }));
    let content: Block[] = doc.content.filter((block) => block.id !== params.blockId);
    if (content.length === 0) {
      content = [{ type: "paragraph", id: ctx.generateId(), children: [{ type: "text", id: ctx.generateId(), text: "", marks: [] }] }];
    }
    const resourceStillUsed = content.some((block) => block.type === "image" && block.resourceId === image.resourceId);
    const resources = resourceStillUsed ? doc.resources : doc.resources.filter((resource) => resource.id !== image.resourceId);
    return ok({ document: { ...doc, content, resources } });
  };
}

/** Atomically embeds an image resource and inserts its image block in one engine transaction. */
export function insertImageResource(params: { afterBlockId: string; mimeType: string; data: string; alt: string; name?: string; width?: number; height?: number }): Command {
  return (doc, ctx) => {
    const index = doc.content.findIndex((block) => block.id === params.afterBlockId);
    if (index === -1) return err(engineError("NODE_NOT_FOUND", `Top-level block "${params.afterBlockId}" not found`, { path: params.afterBlockId }));
    const added = addResource(doc, { kind: "image", mimeType: params.mimeType, data: params.data, name: params.name }, ctx.generateId);
    if (!added.ok) return added;
    const image: ImageBlock = {
      type: "image",
      id: ctx.generateId(),
      resourceId: added.value.resource.id,
      alt: params.alt,
      width: params.width,
      height: params.height,
    };
    const content: Block[] = [...added.value.document.content];
    content.splice(index + 1, 0, image);
    return ok({ document: { ...added.value.document, content } });
  };
}

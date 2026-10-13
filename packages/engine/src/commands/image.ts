import type { Block, ImageBlock } from "../model/types";
import { engineError } from "../errors/errors";
import { err, ok } from "../utils/result";
import type { Command } from "./types";

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

export function removeImage(params: { blockId: string }): Command {
  return (doc) => {
    const exists = doc.content.some((block) => block.id === params.blockId && block.type === "image");
    if (!exists) return err(engineError("NODE_NOT_FOUND", `Image block "${params.blockId}" not found`, { path: params.blockId }));
    const content = doc.content.filter((block) => block.id !== params.blockId);
    return ok({ document: { ...doc, content: content.length > 0 ? content : doc.content } });
  };
}

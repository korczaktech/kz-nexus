import type { Paragraph } from "../model/types";
import { findParagraphLike, mapParagraphLike } from "../model/tree";
import { engineError } from "../errors/errors";
import { err, ok } from "../utils/result";
import type { Command } from "./types";

export type EditorObjectPatch = Partial<NonNullable<Paragraph["editorObject"]>>;

/** Updates native object properties while preserving the paragraph's text and identity. */
export function updateEditorObject(params: { blockId: string; patch: EditorObjectPatch }): Command {
  return (doc) => {
    const target = findParagraphLike(doc.content, params.blockId);
    if (!target) return err(engineError("NODE_NOT_FOUND", `Object block "${params.blockId}" was not found`, { path: params.blockId }));
    if (!target.editorObject) return err(engineError("UNSUPPORTED_OPERATION", "The selected paragraph is not a native editor object", { path: params.blockId }));
    const next = { ...target.editorObject, ...params.patch };
    if (next.label !== undefined && next.label.length > 200) return err(engineError("INVALID_DOCUMENT", "Object label must be at most 200 characters", { path: params.blockId }));
    if (next.width !== undefined && (!Number.isFinite(next.width) || next.width < 1 || next.width > 2000)) return err(engineError("INVALID_DOCUMENT", "Object width must be between 1 and 2000 points", { path: params.blockId }));
    if (next.height !== undefined && (!Number.isFinite(next.height) || next.height < 1 || next.height > 2000)) return err(engineError("INVALID_DOCUMENT", "Object height must be between 1 and 2000 points", { path: params.blockId }));
    const content = mapParagraphLike(doc.content, node => node.id === params.blockId ? { ...node, editorObject: next } : node);
    return ok({ document: { ...doc, content } });
  };
}

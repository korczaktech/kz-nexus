import type { PreviewController } from "../services/controller";
import { readDomSelection } from "./dom-selection";

/**
 * Translates physical browser input into semantic engine operations. The DOM
 * is never allowed to change by itself: every edit is cancelled and re-applied
 * through the controller (and therefore the engine).
 */
export function attachInput(root: HTMLElement, controller: PreviewController): () => void {
  let composing = false;
  let compositionStart: ReturnType<typeof readDomSelection>;
  const syncSelection = (): void => {
    const sel = readDomSelection(root);
    if (sel) controller.setSelection(sel);
  };

  const onBeforeInput = (event: InputEvent): void => {
    if (composing) return;
    syncSelection();
    const type = event.inputType;
    event.preventDefault();
    switch (type) {
      case "insertText":
      case "insertReplacementText":
        controller.insertText(event.data ?? event.dataTransfer?.getData("text/plain") ?? "");
        break;
      case "insertParagraph":
      case "insertLineBreak":
        controller.splitAtCaret();
        break;
      case "deleteContentBackward":
      case "deleteWordBackward":
      case "deleteSoftLineBackward":
        controller.deleteBackward();
        break;
      case "deleteContentForward":
      case "deleteWordForward":
        controller.deleteForward();
        break;
      case "deleteByCut":
      case "deleteContent":
        controller.deleteSelection();
        break;
      case "insertFromPaste":
      case "insertFromDrop":
      case "insertFromYank": {
        const text = event.dataTransfer?.getData("text/plain") ?? "";
        if (text) controller.insertPlainText(text);
        break;
      }
      case "historyUndo":
        controller.undo();
        break;
      case "historyRedo":
        controller.redo();
        break;
      case "formatBold":
        controller.toggleMark({ type: "bold" });
        break;
      case "formatItalic":
        controller.toggleMark({ type: "italic" });
        break;
      case "formatUnderline":
        controller.toggleMark({ type: "underline" });
        break;
      default:
        break; // Unsupported inputs are cancelled, never applied to the DOM.
    }
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const mod = event.ctrlKey || event.metaKey;
    if (!mod) return;
    const key = event.key.toLowerCase();
    if (key === "z" && !event.shiftKey) { event.preventDefault(); controller.undo(); }
    else if (key === "y" || (key === "z" && event.shiftKey)) { event.preventDefault(); controller.redo(); }
    else if (key === "b") { event.preventDefault(); syncSelection(); controller.toggleMark({ type: "bold" }); }
    else if (key === "i") { event.preventDefault(); syncSelection(); controller.toggleMark({ type: "italic" }); }
    else if (key === "u") { event.preventDefault(); syncSelection(); controller.toggleMark({ type: "underline" }); }
  };

  const onCompositionStart = (): void => {
    composing = true;
    compositionStart = readDomSelection(root);
  };
  const onCompositionEnd = (event: CompositionEvent): void => {
    composing = false;
    if (compositionStart) controller.setSelection(compositionStart);
    // Discard whatever the browser put in the DOM and re-apply through the engine.
    if (!controller.insertText(event.data)) controller.setSelection(controller.selection);
  };

  const onSelectionChange = (): void => {
    if (composing) return;
    const sel = readDomSelection(root);
    if (!sel) return;
    const current = controller.selection;
    const same =
      current &&
      current.anchor.blockId === sel.anchor.blockId && current.anchor.offset === sel.anchor.offset &&
      current.focus.blockId === sel.focus.blockId && current.focus.offset === sel.focus.offset;
    if (!same) controller.setSelection(sel);
  };

  root.addEventListener("beforeinput", onBeforeInput as EventListener);
  root.addEventListener("keydown", onKeyDown);
  root.addEventListener("compositionstart", onCompositionStart);
  root.addEventListener("compositionend", onCompositionEnd as EventListener);
  document.addEventListener("selectionchange", onSelectionChange);
  return () => {
    root.removeEventListener("beforeinput", onBeforeInput as EventListener);
    root.removeEventListener("keydown", onKeyDown);
    root.removeEventListener("compositionstart", onCompositionStart);
    root.removeEventListener("compositionend", onCompositionEnd as EventListener);
    document.removeEventListener("selectionchange", onSelectionChange);
  };
}

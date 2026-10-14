/**
 * Input-event policy for IME composition in the Kortex contentEditable bridge.
 *
 * During composition, the browser owns the provisional DOM text. Those events
 * must not be interpreted as ordinary insertText transactions or reconciled
 * until composition has finished.
 */
export function isCompositionInput(
  compositionActive: boolean,
  inputType: string,
  isComposing: boolean,
): boolean {
  return compositionActive
    || isComposing
    || inputType === "insertCompositionText"
    || inputType === "insertFromComposition";
}

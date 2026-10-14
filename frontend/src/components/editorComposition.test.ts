import { describe, expect, it } from "vitest";
import { isCompositionInput } from "./editorComposition";

describe("Kortex IME input policy", () => {
  it("defers every input while the composition session is active", () => {
    expect(isCompositionInput(true, "insertText", false)).toBe(true);
    expect(isCompositionInput(true, "deleteContentBackward", false)).toBe(true);
  });

  it("defers provisional composition input even if the local flag is not set", () => {
    expect(isCompositionInput(false, "insertCompositionText", false)).toBe(true);
    expect(isCompositionInput(false, "insertFromComposition", false)).toBe(true);
    expect(isCompositionInput(false, "insertText", true)).toBe(true);
  });

  it("allows ordinary input after composition is finished", () => {
    expect(isCompositionInput(false, "insertText", false)).toBe(false);
    expect(isCompositionInput(false, "insertParagraph", false)).toBe(false);
    expect(isCompositionInput(false, "deleteContentBackward", false)).toBe(false);
  });
});

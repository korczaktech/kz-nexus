import { describe, expect, it } from "vitest";
import { nextCodePointOffset, previousCodePointOffset } from "./smartCanvasTextOffsets";

describe("SmartCanvas Unicode caret offsets", () => {
  it("moves across a supplementary character as one grapheme", () => {
    const text = "A😀B";
    expect(nextCodePointOffset(text, 1)).toBe(3);
    expect(previousCodePointOffset(text, 3)).toBe(1);
  });

  it("keeps a joined emoji sequence together", () => {
    const text = "A👩‍💻B";
    expect(nextCodePointOffset(text, 1)).toBe(6);
    expect(previousCodePointOffset(text, 6)).toBe(1);
  });

  it("keeps a base character and combining mark together", () => {
    const text = "Ae\u0301B";
    expect(nextCodePointOffset(text, 1)).toBe(3);
    expect(previousCodePointOffset(text, 3)).toBe(1);
  });

  it("deletes a supplementary character without leaving half a surrogate pair", () => {
    const text = "A😀B";
    const start = previousCodePointOffset(text, 3);
    expect(text.slice(0, start) + text.slice(3)).toBe("AB");
    const end = nextCodePointOffset(text, 1);
    expect(text.slice(0, 1) + text.slice(end)).toBe("AB");
  });

  it("clamps offsets outside the string", () => {
    expect(previousCodePointOffset("abc", -4)).toBe(0);
    expect(nextCodePointOffset("abc", 99)).toBe(3);
  });

  it("handles ordinary BMP characters without changing one-step movement", () => {
    expect(nextCodePointOffset("abc", 1)).toBe(2);
    expect(previousCodePointOffset("abc", 2)).toBe(1);
  });

  it("does not move beyond string boundaries", () => {
    expect(previousCodePointOffset("😀", 0)).toBe(0);
    expect(nextCodePointOffset("😀", 2)).toBe(2);
  });
});

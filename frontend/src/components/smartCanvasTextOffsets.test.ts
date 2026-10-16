import { describe, expect, it } from "vitest";
import { lineEndOffset, lineStartOffset, nearestGraphemeOffset, nextCodePointOffset, nextWordOffset, previousCodePointOffset, previousWordOffset, verticalLineOffset, wordRangeAt } from "./smartCanvasTextOffsets";

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


describe("SmartCanvas word navigation", () => {
  it("moves to previous and next word boundaries", () => {
    const text = "alpha beta  gamma";
    expect(previousWordOffset(text, 10)).toBe(6);
    expect(previousWordOffset(text, 6)).toBe(0);
    expect(nextWordOffset(text, 0)).toBe(6);
    expect(nextWordOffset(text, 6)).toBe(12);
  });

  it("selects the token at the cursor and handles whitespace", () => {
    expect(wordRangeAt("alpha beta", 2)).toEqual({ start: 0, end: 5 });
    expect(wordRangeAt("alpha beta", 5)).toEqual({ start: 0, end: 5 });
    expect(wordRangeAt("alpha beta", 6)).toEqual({ start: 6, end: 10 });
    expect(wordRangeAt("", 0)).toEqual({ start: 0, end: 0 });
  });

  it("keeps grapheme sequences intact while moving by word", () => {
    const text = "one 👩‍💻 two";
    expect(nextWordOffset(text, 0)).toBe(4);
    expect(previousWordOffset(text, text.length)).toBe(10);
  });
});


describe("SmartCanvas pointer offset normalization", () => {
  it("snaps pointer offsets away from the middle of grapheme clusters", () => {
    expect(nearestGraphemeOffset("A😀B", 2)).toBe(1);
    expect(nearestGraphemeOffset("A😀B", 3)).toBe(3);
    expect(nearestGraphemeOffset("Ae\u0301B", 2)).toBe(1);
  });
});

describe("SmartCanvas multiline cell navigation", () => {
  it("finds line boundaries without including newline characters", () => {
    const text = "abcd\nef\nghi";
    expect(lineStartOffset(text, 0)).toBe(0);
    expect(lineStartOffset(text, 5)).toBe(5);
    expect(lineStartOffset(text, 7)).toBe(7);
    expect(lineEndOffset(text, 1)).toBe(4);
    expect(lineEndOffset(text, 5)).toBe(7);
    expect(lineEndOffset(text, text.length)).toBe(text.length);
  });

  it("moves between lines and clamps to shorter target lines", () => {
    const text = "abcdef\nxy\n12345";
    expect(verticalLineOffset(text, 4, 1)).toBe(9);
    expect(verticalLineOffset(text, 9, 1, 4)).toBe(14);
    expect(verticalLineOffset(text, 9, -1, 4)).toBe(4);
    expect(verticalLineOffset(text, 2, -1)).toBe(2);
    expect(verticalLineOffset(text, text.length - 1, 1)).toBe(text.length - 1);
  });

  it("supports a trailing empty line after Enter", () => {
    const text = "abc\n";
    expect(verticalLineOffset(text, 3, 1)).toBe(4);
    expect(lineStartOffset(text, 4)).toBe(4);
    expect(lineEndOffset(text, 4)).toBe(4);
  });
});

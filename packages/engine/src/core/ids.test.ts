import { describe, expect, it } from "vitest";
import { createIdGenerator, isValidId } from "./ids";

describe("createIdGenerator", () => {
  it("produces ids that match the expected format", () => {
    const generate = createIdGenerator("n", 42);
    const id = generate();
    expect(isValidId(id)).toBe(true);
    expect(id.startsWith("n_")).toBe(true);
  });

  it("never produces duplicate ids across a large sample", () => {
    const generate = createIdGenerator("n", 1);
    const ids = new Set<string>();
    for (let i = 0; i < 5000; i++) ids.add(generate());
    expect(ids.size).toBe(5000);
  });

  it("is fully deterministic when seeded", () => {
    const a = createIdGenerator("n", 7);
    const b = createIdGenerator("n", 7);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it("produces different sequences for different seeds", () => {
    const a = createIdGenerator("n", 1)();
    const b = createIdGenerator("n", 2)();
    expect(a).not.toBe(b);
  });
});

describe("isValidId", () => {
  it("rejects malformed ids", () => {
    expect(isValidId("")).toBe(false);
    expect(isValidId("abc")).toBe(false);
    expect(isValidId("UPPER_case1234")).toBe(false);
    expect(isValidId(123)).toBe(false);
    expect(isValidId(null)).toBe(false);
  });

  it("accepts well formed ids", () => {
    expect(isValidId("n_0001abcdef")).toBe(true);
  });
});

/**
 * Identifier generation.
 *
 * The engine never relies on global platform randomness directly (no
 * `crypto` assumption). Instead it exposes an injectable `IdGenerator`
 * contract so hosts/tests can supply deterministic or platform-specific
 * implementations.
 */

export type IdGenerator = () => string;

/** Small, dependency-free deterministic PRNG (mulberry32) used for reproducible tests. */
export function createSeededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BASE36_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

function toBase36(value: number, length: number): string {
  let n = value;
  let out = "";
  for (let i = 0; i < length; i++) {
    out = BASE36_ALPHABET[n % 36] + out;
    n = Math.floor(n / 36);
  }
  return out;
}

/**
 * Creates an id generator. Ids are stable in format: `${prefix}_${counter}${random}`.
 * When a numeric `seed` is provided, the sequence is fully deterministic —
 * required for reproducible tests and fixtures.
 */
export function createIdGenerator(prefix = "n", seed?: number): IdGenerator {
  let counter = 0;
  const rand = seed === undefined ? Math.random : createSeededRandom(seed);
  return () => {
    counter += 1;
    const randomPart = toBase36(Math.floor(rand() * 36 ** 6), 6);
    return `${prefix}_${toBase36(counter, 4)}${randomPart}`;
  };
}

const ID_PATTERN = /^[a-z][a-z0-9]*_[a-z0-9]{4,}$/;

export function isValidId(id: unknown): id is string {
  return typeof id === "string" && id.length >= 6 && id.length <= 64 && ID_PATTERN.test(id);
}

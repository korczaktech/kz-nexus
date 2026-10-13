export declare const describe: (name: string, fn: () => void | Promise<void>) => void;
export declare const it: (name: string, fn: () => void | Promise<void>) => void;
export declare const test: typeof it;
export interface Matchers {
  toBe(e: unknown): void; toEqual(e: unknown): void; toStrictEqual(e: unknown): void;
  toBeDefined(): void; toBeUndefined(): void; toBeNull(): void; toBeTruthy(): void; toBeFalsy(): void;
  toBeGreaterThan(n: number): void; toBeGreaterThanOrEqual(n: number): void;
  toBeLessThan(n: number): void; toBeLessThanOrEqual(n: number): void;
  toContain(x: unknown): void; toContainEqual(x: unknown): void; toHaveLength(n: number): void;
  toHaveProperty(k: string): void; toMatch(re: RegExp | string): void; toBeInstanceOf(c: unknown): void;
  toHaveBeenCalledTimes(n: number): void; toHaveBeenCalled(): void; toThrow(m?: string | RegExp): void;
  not: Omit<Matchers, "not">;
}
export declare function expect(actual: unknown): Matchers;
export declare const vi: { fn<A extends unknown[] = unknown[], R = unknown>(impl?: (...a: A) => R): ((...a: A) => R) & { mock: { calls: A[] } } };

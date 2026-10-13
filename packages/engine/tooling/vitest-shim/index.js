// Minimal vitest-compatible API on top of node:test, used ONLY when the real
// `vitest` package cannot be installed (offline sandbox). See docs/TESTING.md.
import { describe as nDescribe, it as nIt } from "node:test";
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";

export const describe = nDescribe;
export const it = nIt;
export const test = nIt;

function strip(v) {
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === "object") {
    const o = {};
    for (const k of Object.keys(v)) if (v[k] !== undefined) o[k] = strip(v[k]);
    return o;
  }
  return v;
}
const eq = (a, b) => isDeepStrictEqual(strip(a), strip(b));
const show = (v) => { try { return JSON.stringify(v); } catch { return String(v); } };

function makeMatchers(actual, negate) {
  const check = (pass, msg) => { if (negate ? pass : !pass) assert.fail((negate ? "NOT " : "") + msg); };
  return {
    toBe: (e) => check(Object.is(actual, e), `expected ${show(actual)} toBe ${show(e)}`),
    toEqual: (e) => check(eq(actual, e), `expected ${show(actual)} toEqual ${show(e)}`),
    toStrictEqual: (e) => check(isDeepStrictEqual(actual, e), `expected ${show(actual)} toStrictEqual ${show(e)}`),
    toBeDefined: () => check(actual !== undefined, `expected value toBeDefined`),
    toBeUndefined: () => check(actual === undefined, `expected ${show(actual)} toBeUndefined`),
    toBeNull: () => check(actual === null, `expected ${show(actual)} toBeNull`),
    toBeTruthy: () => check(!!actual, `expected ${show(actual)} toBeTruthy`),
    toBeFalsy: () => check(!actual, `expected ${show(actual)} toBeFalsy`),
    toBeGreaterThan: (n) => check(actual > n, `expected ${actual} > ${n}`),
    toBeGreaterThanOrEqual: (n) => check(actual >= n, `expected ${actual} >= ${n}`),
    toBeLessThan: (n) => check(actual < n, `expected ${actual} < ${n}`),
    toBeLessThanOrEqual: (n) => check(actual <= n, `expected ${actual} <= ${n}`),
    toContain: (x) => check(actual.includes(x), `expected ${show(actual)} toContain ${show(x)}`),
    toContainEqual: (x) => check(Array.from(actual).some((i) => eq(i, x)), `expected ${show(actual)} toContainEqual ${show(x)}`),
    toHaveLength: (n) => check(actual.length === n, `expected length ${actual?.length} toBe ${n}`),
    toHaveProperty: (k) => check(actual != null && k in Object(actual), `expected property ${k}`),
    toMatch: (re) => check(typeof actual === "string" && new RegExp(re).test(actual), `expected ${show(actual)} toMatch ${re}`),
    toBeInstanceOf: (c) => check(actual instanceof c, `expected instance of ${c.name}`),
    toHaveBeenCalledTimes: (n) => check(actual.mock.calls.length === n, `expected ${n} calls, got ${actual.mock.calls.length}`),
    toHaveBeenCalled: () => check(actual.mock.calls.length > 0, `expected to have been called`),
    toThrow: (m) => {
      let thrown; let did = false;
      try { actual(); } catch (e) { did = true; thrown = e; }
      let pass = did;
      if (did && m !== undefined) {
        const msg = thrown && thrown.message !== undefined ? thrown.message : String(thrown);
        pass = m instanceof RegExp ? m.test(msg) : msg.includes(m);
      }
      check(pass, `expected function toThrow${m ? " " + m : ""}`);
    },
  };
}

export function expect(actual) {
  const m = makeMatchers(actual, false);
  m.not = makeMatchers(actual, true);
  return m;
}

export const vi = {
  fn(impl) {
    const f = (...args) => { f.mock.calls.push(args); return impl ? impl(...args) : undefined; };
    f.mock = { calls: [] };
    return f;
  },
};

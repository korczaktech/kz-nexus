/**
 * Injectable clock so the engine never calls `Date.now()` directly, keeping
 * it deterministic and testable across platforms.
 */
export type Clock = () => number;

export const systemClock: Clock = () => Date.now();

export function createFixedClock(startMs = 0): { now: Clock; advance: (ms: number) => void } {
  let current = startMs;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

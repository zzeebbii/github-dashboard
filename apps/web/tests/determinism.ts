/**
 * Deterministic replacements for ambient non-determinism.
 *
 * Tests must never depend on the real clock or real randomness. The application
 * layer takes Clock and IdGenerator as ports precisely so tests can substitute
 * these, which is why no test in this repository has to freeze timers globally.
 */

/** A clock frozen at a fixed instant. */
export function fixedClock(iso = "2026-01-01T00:00:00.000Z"): { now(): Date } {
  return { now: () => new Date(iso) };
}

/** A clock that starts fixed and can be advanced explicitly. */
export function advanceableClock(start = "2026-01-01T00:00:00.000Z"): {
  now(): Date;
  advance(ms: number): void;
} {
  let current = new Date(start).getTime();
  return {
    now: () => new Date(current),
    advance: (ms: number) => {
      current += ms;
    },
  };
}

/**
 * Produces stable, valid UUIDs in a predictable sequence, so assertions can name
 * exact ids instead of matching a pattern.
 */
export function sequentialUuids(): { next(): string } {
  let counter = 0;
  return {
    next: () => {
      counter += 1;
      return `00000000-0000-4000-8000-${counter.toString(16).padStart(12, "0")}`;
    },
  };
}

/** The nth id in the `sequentialUuids` sequence — for naming expected values. */
export function nthUuid(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

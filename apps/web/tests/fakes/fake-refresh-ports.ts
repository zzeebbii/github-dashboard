import type { CrossTabPort, RefreshedMessage } from "../../src/application/cross-tab.ts";
import type {
  RateLimitPool,
  RateLimitReader,
  RateLimitState,
} from "../../src/application/rate-limits.ts";
import type { PageSignal, ScheduleTimer } from "../../src/application/refresh-scheduler.ts";
import { advanceableClock } from "../determinism.ts";

/** Lets queued promise work (TanStack Query batches on a 0 ms timeout) run to the end. */
export async function settle(): Promise<void> {
  for (let round = 0; round < 5; round += 1) {
    // oxlint-disable-next-line no-await-in-loop -- reason: each round must wait for the previous one's timeouts
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

/**
 * An advanceable clock with a timer port on it: `advance(ms)` moves time forward and fires
 * every timer that falls due on the way, in order. No global fake timers.
 */
export function manualTime(start = "2026-10-16T06:00:00.000Z") {
  const clock = advanceableClock(start);
  const pending = new Set<{ at: number; callback: () => void }>();

  const timer: ScheduleTimer = (callback, ms) => {
    const entry = { at: clock.now().getTime() + ms, callback };
    pending.add(entry);
    return () => {
      pending.delete(entry);
    };
  };

  async function advance(ms: number) {
    const end = clock.now().getTime() + ms;
    for (;;) {
      const next = [...pending]
        .filter((entry) => entry.at <= end)
        .toSorted((a, b) => a.at - b.at)[0];
      if (next === undefined) break;
      pending.delete(next);
      clock.advance(Math.max(0, next.at - clock.now().getTime()));
      next.callback();
      // oxlint-disable-next-line no-await-in-loop -- reason: timers fire in order, each after the previous one's work
      await settle();
    }
    clock.advance(end - clock.now().getTime());
  }

  return { clock, timer, advance };
}

/** A visibility or online signal a test flips by hand. */
export function fakeSignal(initial = true): PageSignal & { set(value: boolean): void } {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    current: () => value,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next) {
      value = next;
      for (const listener of listeners) listener();
    },
  };
}

/** One tab on its own: the leader at once (as without Web Locks); records what it publishes. */
export function inMemoryCrossTab({ leader = true } = {}): CrossTabPort & {
  readonly published: RefreshedMessage[];
  deliver(message: RefreshedMessage): void;
} {
  const listeners = new Set<(message: RefreshedMessage) => void>();
  const published: RefreshedMessage[] = [];
  return {
    published,
    runAsLeader(onLeader) {
      if (leader) onLeader();
    },
    publish(message) {
      published.push(message);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    deliver(message) {
      for (const listener of listeners) listener(message);
    },
  };
}

/** Rate-limit state a test sets directly. Like the real tracker, it forgets at the reset. */
export function fakeRateLimits(clock: { now(): Date }): RateLimitReader & {
  set(pool: RateLimitPool, state: RateLimitState): void;
  pause(until: Date): void;
} {
  const pools = new Map<RateLimitPool, RateLimitState>();
  let paused: Date | undefined;
  const live = (at: Date | undefined) => (at !== undefined && at > clock.now() ? at : undefined);
  return {
    get: (_accountId, pool) => {
      const state = pools.get(pool);
      return live(state?.resetAt) === undefined ? undefined : state;
    },
    pausedUntil: () => live(paused),
    set(pool, state) {
      pools.set(pool, state);
    },
    pause(until) {
      paused = until;
    },
  };
}

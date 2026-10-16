import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import {
  fakeRateLimits,
  fakeSignal,
  inMemoryCrossTab,
  manualTime,
  settle,
} from "../../tests/fakes/fake-refresh-ports.ts";
import { toAccountId } from "../domain/account.ts";
import { createQueryRefresher, createRefreshScheduler } from "./refresh-scheduler.ts";

const A = toAccountId(1)!;
const B = toAccountId(2)!;
const MINUTE = 60_000;
const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/**
 * A fake GitHub list query, mounted under the `[store, accountId, ...]` key convention
 * that T16 and T20's real ones will use. `answer` decides what each fetch returns.
 */
function mountQuery(
  client: QueryClient,
  restoredAt: Date,
  accountId = A,
  answer = (n: number): unknown => ({ n }),
) {
  let fetches = 0;
  const observer = new QueryObserver(client, {
    queryKey: ["prLists", accountId, "home"],
    // Restored from the cache at `restoredAt`, so mounting fetches nothing. (TanStack stamps
    // fetched data with the real Date.now(); restored data carries the test clock's time.)
    initialData: answer(0),
    initialDataUpdatedAt: restoredAt.getTime(),
    queryFn: () => {
      fetches += 1;
      return answer(fetches);
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
  cleanups.push(observer.subscribe(() => undefined));
  return { fetches: () => fetches };
}

function setup({ leader = true } = {}) {
  const time = manualTime();
  const visibility = fakeSignal(true);
  const online = fakeSignal(true);
  const crossTab = inMemoryCrossTab({ leader });
  const rateLimits = fakeRateLimits(time.clock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const query = mountQuery(client, time.clock.now());
  const scheduler = createRefreshScheduler({
    clock: time.clock,
    timer: time.timer,
    visibility,
    online,
    crossTab,
    rateLimits,
    refresher: createQueryRefresher(client),
  });
  const outcomes: { manual: boolean; changed: boolean }[] = [];
  scheduler.onRefreshed((outcome) => outcomes.push(outcome));
  scheduler.start();
  scheduler.setAccount(A);
  cleanups.push(() => {
    scheduler.stop();
  });
  return { time, visibility, online, crossTab, rateLimits, client, query, scheduler, outcomes };
}

describe("refresh scheduler (FR-3.7)", () => {
  it("starts from the cached data's age and refreshes every 5 minutes while visible", async () => {
    const { time, query, scheduler } = setup();
    expect(query.fetches()).toBe(0);
    expect(scheduler.getState().lastRefreshAt).toEqual(time.clock.now());

    await time.advance(5 * MINUTE - 1);
    expect(query.fetches()).toBe(0);
    await time.advance(1);
    expect(query.fetches()).toBe(1);
    await time.advance(5 * MINUTE);
    expect(query.fetches()).toBe(2);
  });

  it("pauses while hidden; focus after more than 60 s refreshes at once", async () => {
    const { time, visibility, query } = setup();

    visibility.set(false);
    await time.advance(30 * MINUTE);
    expect(query.fetches()).toBe(0);

    visibility.set(true);
    await settle();
    expect(query.fetches()).toBe(1);
  });

  it("focus within 60 s of the last refresh does not refresh", async () => {
    const { time, visibility, query } = setup();

    await time.advance(59_000);
    visibility.set(true);
    await settle();

    expect(query.fetches()).toBe(0);
  });

  it("manual refresh works while paused, and announces itself", async () => {
    const { time, visibility, rateLimits, query, scheduler, outcomes } = setup();
    rateLimits.set("graphql", {
      limit: 5000,
      remaining: 100,
      resetAt: new Date(time.clock.now().getTime() + 60 * MINUTE),
      lastCost: 1,
    });
    visibility.set(false);

    await scheduler.refreshNow();

    expect(query.fetches()).toBe(1);
    expect(outcomes).toEqual([{ manual: true, changed: true }]);
  });

  it("an unchanged automatic refresh is not news", async () => {
    const client = new QueryClient();
    const time = manualTime();
    mountQuery(client, time.clock.now(), A, () => ({ same: true }));
    const scheduler = createRefreshScheduler({
      clock: time.clock,
      timer: time.timer,
      visibility: fakeSignal(true),
      online: fakeSignal(true),
      crossTab: inMemoryCrossTab(),
      rateLimits: fakeRateLimits(time.clock),
      refresher: createQueryRefresher(client),
    });
    const outcomes: unknown[] = [];
    scheduler.onRefreshed((outcome) => outcomes.push(outcome));
    scheduler.start();
    scheduler.setAccount(A);
    cleanups.push(() => {
      scheduler.stop();
    });

    await time.advance(5 * MINUTE);

    expect(outcomes).toEqual([{ manual: false, changed: false }]);
  });

  it("coalesces a refresh requested while one runs", async () => {
    const { query, scheduler } = setup();

    await Promise.all([scheduler.refreshNow(), scheduler.refreshNow()]);

    expect(query.fetches()).toBe(1);
  });
});

describe("quota guard in the scheduler (FR-3.8, AC-3.3)", () => {
  it("15% remaining: the next refresh is 10 minutes away", async () => {
    const { time, rateLimits, query, scheduler } = setup();
    rateLimits.set("graphql", {
      limit: 5000,
      remaining: 750,
      resetAt: new Date(time.clock.now().getTime() + 60 * MINUTE),
      lastCost: 1,
    });
    await scheduler.refreshNow();

    await time.advance(10 * MINUTE - 1);
    expect(query.fetches()).toBe(1);
    await time.advance(1);
    expect(query.fetches()).toBe(2);
  });

  it("4% remaining: no automatic request until resetAt, not even on focus", async () => {
    const { time, rateLimits, visibility, query, scheduler } = setup();
    const resetAt = new Date(time.clock.now().getTime() + 42 * MINUTE);
    rateLimits.set("graphql", { limit: 5000, remaining: 200, resetAt, lastCost: 1 });
    await scheduler.refreshNow();

    await time.advance(20 * MINUTE);
    visibility.set(true);
    await time.advance(22 * MINUTE - 1);
    expect(query.fetches()).toBe(1);
    await time.advance(1);
    expect(query.fetches()).toBe(2);
  });

  it("a secondary limit holds automatic refreshes until retry-after", async () => {
    const { time, rateLimits, query, scheduler } = setup();
    rateLimits.pause(new Date(time.clock.now().getTime() + 8 * MINUTE));
    await scheduler.refreshNow();
    expect(query.fetches()).toBe(1);

    await time.advance(8 * MINUTE - 1);
    expect(query.fetches()).toBe(1);
    await time.advance(1);
    expect(query.fetches()).toBe(2);
  });
});

describe("offline (FR-3.11, AC-3.9)", () => {
  it("stops while offline and refreshes as soon as it is back", async () => {
    const { time, online, query, scheduler } = setup();

    online.set(false);
    expect(scheduler.getState().online).toBe(false);
    await time.advance(20 * MINUTE);
    expect(query.fetches()).toBe(0);

    online.set(true);
    await settle();
    expect(scheduler.getState().online).toBe(true);
    expect(query.fetches()).toBe(1);
  });
});

describe("cross-tab (FR-3.9)", () => {
  it("a follower never refreshes on its own, and applies the leader's results", async () => {
    const { time, crossTab, client, query, scheduler, outcomes } = setup({ leader: false });
    const at = new Date(time.clock.now().getTime() + 5 * MINUTE);

    await time.advance(5 * MINUTE);
    crossTab.deliver({
      type: "refreshed",
      accountId: A,
      at,
      quota: {},
      updates: [{ queryKey: ["prLists", A, "home"], data: { n: 99 }, updatedAt: at.getTime() }],
    });
    await time.advance(30 * MINUTE);

    expect(query.fetches()).toBe(0);
    expect(client.getQueryData(["prLists", A, "home"])).toEqual({ n: 99 });
    expect(scheduler.getState().lastRefreshAt).toEqual(at);
    expect(outcomes).toEqual([{ manual: false, changed: true }]);
  });

  it("the leader publishes each refresh with what changed and the quota", async () => {
    const { time, crossTab, rateLimits, scheduler } = setup();
    const graphql = {
      limit: 5000,
      remaining: 4000,
      resetAt: new Date(time.clock.now().getTime() + MINUTE),
      lastCost: 2,
    };
    rateLimits.set("graphql", graphql);

    await scheduler.refreshNow();

    expect(crossTab.published).toEqual([
      {
        type: "refreshed",
        accountId: A,
        at: time.clock.now(),
        quota: { graphql },
        updates: [
          {
            queryKey: ["prLists", A, "home"],
            data: { n: 1 },
            updatedAt: expect.any(Number) as number,
          },
        ],
      },
    ]);
    expect(scheduler.getState().quota).toEqual({ graphql });
  });

  it("ignores another account's results", () => {
    const { crossTab, client, scheduler } = setup({ leader: false });
    const before = scheduler.getState();

    crossTab.deliver({ type: "refreshed", accountId: B, at: new Date(), quota: {}, updates: [] });

    expect(scheduler.getState().lastRefreshAt).toEqual(before.lastRefreshAt);
    expect(client.getQueryData(["prLists", A, "home"])).toEqual({ n: 0 });
  });
});

describe("accounts", () => {
  it("refreshes only the active account's queries", async () => {
    const { client, query, scheduler } = setup();
    const other = mountQuery(client, new Date(0), B);

    await scheduler.refreshNow();

    expect(query.fetches()).toBe(1);
    expect(other.fetches()).toBe(0);

    scheduler.setAccount(null);
    await scheduler.refreshNow();
    expect(scheduler.getState()).toMatchObject({ accountId: null, lastRefreshAt: null });
  });

  it("ticks the clock every 30 s while visible, for 'Updated N min ago'", async () => {
    const { time, scheduler } = setup();
    const start = scheduler.getState().now.getTime();

    await time.advance(30_000);

    expect(scheduler.getState().now.getTime()).toBe(start + 30_000);
  });
});

// `.tsx` only so this runs in the Chromium "component" project: Web Locks and
// BroadcastChannel need a real browser. No JSX here.
import { afterEach, expect, test } from "vitest";
import {
  fakeRateLimits,
  fakeSignal,
  manualTime,
  settle,
} from "../../../tests/fakes/fake-refresh-ports.ts";
import { createRefreshScheduler } from "../../application/refresh-scheduler.ts";
import { toAccountId } from "../../domain/account.ts";
import { createWebLocksCrossTab } from "./web-locks.ts";

const A = toAccountId(1)!;
const MINUTE = 60_000;
const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/**
 * A "tab": a same-origin iframe, whose own LockManager the adapter uses. Removing the
 * iframe destroys its document, which is what closing a tab does to the lock it holds.
 * The channel stays in this realm, so received Dates are this realm's Dates.
 */
function openTab() {
  const frame = document.createElement("iframe");
  document.body.append(frame);
  const channel = new BroadcastChannel("ghd");
  const crossTab = createWebLocksCrossTab({ locks: frame.contentWindow!.navigator.locks, channel });
  cleanups.push(() => {
    frame.remove();
    channel.close();
  });
  return { frame, crossTab };
}

/** A tab running the real scheduler; `requests()` counts what it sent to "GitHub". */
function tabWithScheduler(time: ReturnType<typeof manualTime>) {
  const { frame, crossTab } = openTab();
  let requests = 0;
  const scheduler = createRefreshScheduler({
    clock: time.clock,
    timer: time.timer,
    visibility: fakeSignal(true),
    online: fakeSignal(true),
    crossTab,
    rateLimits: fakeRateLimits(time.clock),
    refresher: {
      refresh: () => {
        requests += 1;
        return Promise.resolve([]);
      },
      apply: () => undefined,
      pullRequests: () => [],
      lastUpdated: () => time.clock.now(),
    },
  });
  scheduler.start();
  scheduler.setAccount(A);
  cleanups.push(() => {
    scheduler.stop();
  });
  return {
    requests: () => requests,
    scheduler,
    /** Closing a tab: its document goes, and with it its timers and its lock. */
    close() {
      scheduler.stop();
      frame.remove();
    },
  };
}

test("with two tabs only one makes requests; closing it hands over within one cycle (AC-3.6)", async () => {
  const time = manualTime();
  const first = tabWithScheduler(time);
  const second = tabWithScheduler(time);
  await settle();

  await time.advance(5 * MINUTE);
  expect(first.requests()).toBe(1);
  expect(second.requests()).toBe(0);
  await time.advance(5 * MINUTE);
  expect([first.requests(), second.requests()]).toEqual([2, 0]);

  first.close();
  await expect
    .poll(async () => {
      await time.advance(5 * MINUTE);
      return second.requests();
    })
    .toBeGreaterThan(0);
  // The handover cycle: the second tab took over on the next tick, not later.
  expect(second.requests()).toBe(1);
});

test("followers receive the leader's message, validated; never their own", async () => {
  const leader = openTab();
  const follower = openTab();
  const heardByFollower: unknown[] = [];
  const heardByLeader: unknown[] = [];
  follower.crossTab.subscribe((message) => heardByFollower.push(message));
  leader.crossTab.subscribe((message) => heardByLeader.push(message));
  const message = {
    type: "refreshed",
    accountId: A,
    at: new Date("2026-10-16T06:00:00Z"),
    quota: {
      graphql: {
        limit: 5000,
        remaining: 10,
        resetAt: new Date("2026-10-16T07:00:00Z"),
        lastCost: 1,
      },
    },
    updates: [{ queryKey: ["prLists", A, "home"], data: { n: 1 }, updatedAt: 1 }],
  } as const;

  leader.crossTab.publish(message);
  // An older or broken build's message is dropped, not applied.
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- reason: BroadcastChannel takes no targetOrigin
  new BroadcastChannel("ghd").postMessage({ type: "refreshed", accountId: "nope" });

  await expect.poll(() => heardByFollower).toEqual([message]);
  await settle();
  expect(heardByFollower).toHaveLength(1);
  expect(heardByLeader).toEqual([]);
});

test("without Web Locks every tab is its own leader, at once", () => {
  const crossTab = createWebLocksCrossTab({ locks: undefined });
  cleanups.push(() => {
    crossTab.close();
  });
  let leader = false;

  crossTab.runAsLeader(() => {
    leader = true;
  });

  expect(leader).toBe(true);
});

test("close() gives up the lock, or the wait for it", async () => {
  const first = createWebLocksCrossTab();
  const waiting = createWebLocksCrossTab();
  const third = createWebLocksCrossTab();
  const leaders: string[] = [];
  first.runAsLeader(() => leaders.push("first"));
  await expect.poll(() => leaders).toEqual(["first"]);
  waiting.runAsLeader(() => leaders.push("waiting"));
  third.runAsLeader(() => leaders.push("third"));

  waiting.close();
  first.close();

  await expect.poll(() => leaders).toEqual(["first", "third"]);
  third.close();
});

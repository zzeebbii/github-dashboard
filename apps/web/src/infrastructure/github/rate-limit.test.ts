import { afterEach, describe, expect, it } from "vitest";
import { toAccountId } from "../../domain/account.ts";
import { createRateLimitTracker } from "./rate-limit.ts";

const A = toAccountId(1)!;
const B = toAccountId(2)!;
const RESET = 1792132567;

function headers(resource: string, remaining: string) {
  return new Headers({
    "x-ratelimit-limit": "5000",
    "x-ratelimit-remaining": remaining,
    "x-ratelimit-reset": String(RESET),
    "x-ratelimit-resource": resource,
  });
}

const NOW = new Date("2026-10-16T06:00:00Z");

function setup(now = NOW, storage: Storage | null = null) {
  const clock = { now: () => now };
  return { tracker: createRateLimitTracker(clock, storage), clock };
}

describe("rate-limit tracker (FR-3.4)", () => {
  it("reads x-ratelimit-* headers into the pool they name, per account", () => {
    const { tracker } = setup();

    tracker.fromHeaders(A, headers("core", "4999"));
    tracker.fromHeaders(A, headers("search", "29"));
    tracker.fromHeaders(B, headers("core", "10"));

    const resetAt = new Date(RESET * 1000);
    expect(tracker.get(A, "core")).toEqual({
      limit: 5000,
      remaining: 4999,
      resetAt,
      lastCost: null,
      observedAt: NOW,
    });
    expect(tracker.get(A, "search")?.remaining).toBe(29);
    expect(tracker.get(A, "graphql")).toBeUndefined();
    expect(tracker.get(B, "core")?.remaining).toBe(10);
  });

  it("reads GraphQL's rateLimit field, and keeps its cost when headers follow", () => {
    const { tracker } = setup();

    tracker.fromGraphQL(A, {
      cost: 3,
      limit: 5000,
      remaining: 4990,
      resetAt: "2026-10-16T06:36:07Z",
    });
    tracker.fromHeaders(A, headers("graphql", "4989"));

    expect(tracker.get(A, "graphql")).toEqual({
      limit: 5000,
      remaining: 4989,
      resetAt: new Date(RESET * 1000),
      lastCost: 3,
      observedAt: NOW,
    });
  });

  it.each([
    ["an unknown pool", headers("code_search", "9")],
    ["missing headers", new Headers({ "x-ratelimit-resource": "core" })],
    ["a non-numeric header", headers("core", "lots")],
  ])("ignores %s", (_name, value) => {
    const { tracker } = setup();

    tracker.fromHeaders(A, value);
    tracker.fromGraphQL(A, { cost: 1, limit: 5000, remaining: 1, resetAt: "not a date" });

    expect(tracker.get(A, "core")).toBeUndefined();
    expect(tracker.get(A, "graphql")).toBeUndefined();
  });

  it("forgets a window once it has reset", () => {
    const { tracker } = setup(new Date((RESET + 1) * 1000));

    tracker.fromHeaders(A, headers("core", "0"));

    expect(tracker.get(A, "core")).toBeUndefined();
  });

  it("pauses one account until a secondary limit's retry-after", () => {
    let now = new Date("2026-10-16T06:00:00Z");
    const tracker = createRateLimitTracker({ now: () => now }, null);
    const retryAt = new Date("2026-10-16T06:00:30Z");

    tracker.secondaryLimit(A, retryAt);

    expect(tracker.pausedUntil(A)).toEqual(retryAt);
    expect(tracker.pausedUntil(B)).toBeUndefined();
    now = retryAt;
    expect(tracker.pausedUntil(A)).toBeUndefined();
  });

  it("tells subscribers which account each response was for, until they unsubscribe", () => {
    const { tracker } = setup();
    const heard: unknown[] = [];
    const off = tracker.subscribe((accountId) => heard.push(accountId));

    tracker.fromHeaders(A, headers("core", "4999"));
    tracker.fromGraphQL(B, { cost: 1, limit: 5000, remaining: 1, resetAt: "2026-10-16T06:36:07Z" });
    tracker.fromHeaders(A, headers("code_search", "9"));
    off();
    tracker.fromHeaders(A, headers("core", "4998"));

    expect(heard).toEqual([A, B]);
  });
});

describe("rate-limit tracker across a reload", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it("a new tracker on the same storage knows the last state, and when it was observed", () => {
    setup(NOW, sessionStorage).tracker.fromHeaders(A, headers("core", "4999"));

    const later = new Date(NOW.getTime() + 120_000);
    const reloaded = setup(later, sessionStorage).tracker;

    expect(reloaded.get(A, "core")).toEqual({
      limit: 5000,
      remaining: 4999,
      resetAt: new Date(RESET * 1000),
      lastCost: null,
      observedAt: NOW,
    });
    expect(reloaded.get(B, "core")).toBeUndefined();
    // A new response adds to what was restored; it does not drop the other pools.
    reloaded.fromHeaders(A, headers("search", "29"));
    expect(setup(later, sessionStorage).tracker.get(A, "core")?.remaining).toBe(4999);
  });

  it("forgets a stored window that has reset, and ignores unreadable data", () => {
    setup(NOW, sessionStorage).tracker.fromHeaders(A, headers("core", "4999"));
    sessionStorage.setItem(`ghd:quota:${B}`, "{not json");

    const afterReset = setup(new Date((RESET + 1) * 1000), sessionStorage).tracker;

    expect(afterReset.get(A, "core")).toBeUndefined();
    expect(afterReset.get(B, "core")).toBeUndefined();
  });
});

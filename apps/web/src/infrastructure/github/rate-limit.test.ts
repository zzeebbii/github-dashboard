import { describe, expect, it } from "vitest";
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

function setup(now = new Date("2026-10-16T06:00:00Z")) {
  const clock = { now: () => now };
  return { tracker: createRateLimitTracker(clock), clock };
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
});

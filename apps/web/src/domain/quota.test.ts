import { describe, expect, it } from "vitest";
import { nextRefreshDelay, quotaLevel, REFRESH_INTERVAL_MS } from "./quota.ts";

const resetAt = new Date("2026-10-16T07:00:00Z");
const pool = (remaining: number) => ({ limit: 5000, remaining, resetAt });

describe("quota guard (FR-3.8)", () => {
  it("refreshes every 5 minutes with plenty left, or when nothing is known", () => {
    expect(nextRefreshDelay(pool(4000), REFRESH_INTERVAL_MS)).toEqual({
      kind: "every",
      ms: 300_000,
    });
    expect(nextRefreshDelay(undefined, REFRESH_INTERVAL_MS)).toEqual({
      kind: "every",
      ms: 300_000,
    });
  });

  it("15% remaining: the next refresh is 10 minutes away (AC-3.3)", () => {
    expect(nextRefreshDelay(pool(750), REFRESH_INTERVAL_MS)).toEqual({
      kind: "every",
      ms: 600_000,
    });
  });

  it("4% remaining: no automatic refresh until resetAt (AC-3.3)", () => {
    expect(nextRefreshDelay(pool(200), REFRESH_INTERVAL_MS)).toEqual({
      kind: "pausedUntil",
      until: resetAt,
    });
  });

  it("names the level at the 20% and 5% edges", () => {
    expect(quotaLevel(pool(1000))).toBe("ok");
    expect(quotaLevel(pool(999))).toBe("low");
    expect(quotaLevel(pool(250))).toBe("low");
    expect(quotaLevel(pool(249))).toBe("critical");
    expect(quotaLevel({ limit: 0, remaining: 0, resetAt })).toBe("critical");
  });
});

import { describe, expect, it } from "vitest";
import { CHECK_POLL_MS, hasPendingChecks, shouldRefetchChecks } from "./check-polling.ts";

const fetchedAt = new Date("2026-10-16T06:00:00Z");
const after = (ms: number) => new Date(fetchedAt.getTime() + ms);
const running = [{ status: "COMPLETED" }, { status: "IN_PROGRESS" }] as const;
const done = [{ status: "COMPLETED" }, { status: "COMPLETED" }] as const;

describe("shouldRefetchChecks (AC-6.2)", () => {
  it("refetches a running check once the last fetch is 60 s old, not sooner", () => {
    expect(shouldRefetchChecks(running, fetchedAt, after(CHECK_POLL_MS - 1))).toBe(false);
    expect(shouldRefetchChecks(running, fetchedAt, after(CHECK_POLL_MS))).toBe(true);
  });

  it.each(["QUEUED", "PENDING", "REQUESTED", "WAITING"] as const)(
    "treats %s as pending",
    (status) => {
      expect(shouldRefetchChecks([{ status }], fetchedAt, after(CHECK_POLL_MS))).toBe(true);
    },
  );

  it("never refetches once every run has completed, however old the fetch", () => {
    expect(shouldRefetchChecks(done, fetchedAt, after(CHECK_POLL_MS))).toBe(false);
    expect(shouldRefetchChecks(done, fetchedAt, after(365 * 24 * 3_600_000))).toBe(false);
  });

  it("treats a commit with no check runs as settled", () => {
    expect(hasPendingChecks([])).toBe(false);
    expect(shouldRefetchChecks([], fetchedAt, after(CHECK_POLL_MS))).toBe(false);
  });
});

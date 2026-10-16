import { describe, expect, it } from "vitest";
import type { ReviewThread, TimelineItem } from "./pr-detail.ts";
import { checkDuration, checkOutcome, conversation } from "./pr-panel.ts";

const human = { login: "alice", typename: "User" };
const bot = { login: "renovate[bot]", typename: "Bot" };
const comment = (id: string, at: string, author = human): TimelineItem => ({
  kind: "comment",
  id,
  url: `https://github.com/o/r/pull/1#${id}`,
  author,
  createdAt: at,
  bodyHTML: "",
});
const thread = (id: string, at: string, isResolved: boolean, author = human): ReviewThread => ({
  id,
  isResolved,
  isOutdated: false,
  path: "src/a.ts",
  line: 1,
  comments: [{ id: `${id}c`, url: "", author, createdAt: at, bodyHTML: "", diffHunk: "" }],
});

const TIMELINE = [
  comment("c1", "2026-10-01T00:00:00Z"),
  comment("b1", "2026-10-02T00:00:00Z", bot),
  comment("c2", "2026-10-04T00:00:00Z"),
  comment("b2", "2026-10-05T00:00:00Z", bot),
];
const THREADS = [
  thread("t1", "2026-10-03T00:00:00Z", false),
  thread("t2", "2026-10-03T12:00:00Z", true),
  thread("t3", "2026-10-06T00:00:00Z", false, bot),
];
const ids = (entries: ReturnType<typeof conversation>) =>
  entries.map((e) =>
    e.kind === "item" ? e.item.id : e.kind === "thread" ? e.thread.id : `bot:${e.items.length}`,
  );

describe("conversation", () => {
  it("merges threads into the timeline by time and groups each bot where it first spoke", () => {
    expect(ids(conversation(TIMELINE, THREADS, "all"))).toEqual([
      "c1",
      "bot:2",
      "t1",
      "t2",
      "c2",
      "t3",
    ]);
  });

  it("Unresolved shows only unresolved threads (AC-6.6)", () => {
    expect(ids(conversation(TIMELINE, THREADS, "unresolved"))).toEqual(["t1", "t3"]);
  });

  it("Humans hides every bot item and bot thread (AC-6.6)", () => {
    expect(ids(conversation(TIMELINE, THREADS, "humans"))).toEqual(["c1", "t1", "t2", "c2"]);
  });
});

describe("checks", () => {
  it("groups runs by outcome", () => {
    expect(checkOutcome({ status: "IN_PROGRESS", conclusion: null })).toBe("running");
    expect(checkOutcome({ status: "COMPLETED", conclusion: "SUCCESS" })).toBe("passed");
    expect(checkOutcome({ status: "COMPLETED", conclusion: "TIMED_OUT" })).toBe("failed");
    expect(checkOutcome({ status: "COMPLETED", conclusion: "SKIPPED" })).toBe("skipped");
  });

  it("measures a finished run only", () => {
    expect(
      checkDuration({ startedAt: "2026-10-01T00:00:00Z", completedAt: "2026-10-01T00:01:05Z" }),
    ).toBe(65_000);
    expect(checkDuration({ startedAt: "2026-10-01T00:00:00Z", completedAt: null })).toBeNull();
  });
});

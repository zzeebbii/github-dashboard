import { describe, expect, it } from "vitest";
import { hasActivitySince, isStale, newActivityCount, newSinceRefresh } from "./activity.ts";
import type { ActivityItem, PullRequest } from "./pull-request.ts";

function pr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: "PR_1",
    repository: "acme/app",
    number: 1,
    title: "A change",
    url: "https://github.com/acme/app/pull/1",
    author: { login: "alice", typename: "User" },
    labels: [],
    isDraft: false,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-02T00:00:00Z",
    headSha: "0000000000000000000000000000000000000001",
    additions: 1,
    deletions: 1,
    commentCount: 0,
    reviewDecision: null,
    checkState: null,
    mergeable: "UNKNOWN",
    reviewRequests: [],
    reviews: [],
    headCommittedAt: null,
    viewerReviewRequestedAt: null,
    activity: [],
    ...overrides,
  };
}

const day = (d: number): string => `2026-10-${String(d).padStart(2, "0")}T00:00:00Z`;

function item(
  kind: ActivityItem["kind"],
  login: string | null,
  createdAt: string,
  typename = "User",
): ActivityItem {
  return { kind, author: login === null ? null : { login, typename }, createdAt };
}

describe("newActivityCount", () => {
  const seen = day(5);
  const cases: readonly [string, readonly ActivityItem[], number][] = [
    ["nothing happened", [], 0],
    [
      "counts comments, reviews and replies after the marker",
      [
        item("comment", "bob", day(6)),
        item("review", "bob", day(7)),
        item("reply", "carol", day(8)),
      ],
      3,
    ],
    [
      "ignores items at or before the marker",
      [item("comment", "bob", day(4)), item("comment", "bob", seen)],
      0,
    ],
    ["ignores the viewer's own comments", [item("comment", "Me", day(6))], 0],
    ["ignores bots by typename", [item("comment", "ci-helper", day(6), "Bot")], 0],
    ["ignores bots by [bot] login suffix", [item("comment", "dependabot[bot]", day(6))], 0],
    ["ignores commits", [item("commit", "bob", day(6))], 0],
    ["counts deleted-account comments", [item("comment", null, day(6))], 1],
  ];

  it.each(cases)("%s", (_name, activity, expected) => {
    expect(newActivityCount(pr({ activity }), "me", seen)).toBe(expected);
  });

  it("is hidden (null) without a seen marker", () => {
    expect(
      newActivityCount(pr({ activity: [item("comment", "bob", day(6))] }), "me", null),
    ).toBeNull();
  });
});

describe("isStale", () => {
  const now = new Date("2026-10-20T00:00:00Z");
  const cases: readonly [string, Partial<PullRequest>, boolean][] = [
    ["created 19 days ago, no activity", {}, true],
    ["created 13 days ago", { createdAt: day(7) }, false],
    ["exactly 14 days since creation", { createdAt: day(6) }, true],
    ["recent human comment", { activity: [item("comment", "bob", day(15))] }, false],
    ["recent human commit", { activity: [item("commit", "bob", day(15))] }, false],
    ["recent human review", { activity: [item("review", "bob", day(15))] }, false],
    [
      "only recent bot activity is ignored",
      {
        activity: [
          item("comment", "renovate[bot]", day(19)),
          item("commit", "github-actions", day(19), "Bot"),
        ],
      },
      true,
    ],
  ];

  it.each(cases)("%s", (_name, overrides, expected) => {
    expect(isStale(pr(overrides), now)).toBe(expected);
  });
});

describe("hasActivitySince", () => {
  const seen = day(5);
  const cases: readonly [string, readonly ActivityItem[], string | null, boolean][] = [
    ["no marker: hidden, nothing to count", [item("comment", "bob", day(6))], null, false],
    ["the last comment is older than the marker", [item("comment", "bob", day(4))], seen, false],
    ["a commit does not count", [item("commit", "bob", day(6))], seen, false],
    ["a newer comment, even the viewer's own", [item("comment", "me", day(6))], seen, true],
  ];
  it.each(cases)("%s", (_name, activity, seenAt, expected) => {
    expect(hasActivitySince(pr({ activity }), seenAt)).toBe(expected);
  });
});

describe("newSinceRefresh (FR-7.4)", () => {
  const old = pr({ id: "PR_old", updatedAt: day(5) });

  it("counts PRs that were in no list before", () => {
    expect(newSinceRefresh([old], [old, pr({ id: "PR_a" }), pr({ id: "PR_b" })], "me")).toBe(2);
  });

  it("counts a PR with a comment or review by another human since its previous version", () => {
    const commented = { ...old, activity: [item("comment", "bob", day(6))] };
    const reviewed = { ...old, activity: [item("review", "bob", day(6))] };
    expect(newSinceRefresh([old], [commented], "me")).toBe(1);
    expect(newSinceRefresh([old], [reviewed], "me")).toBe(1);
  });

  it("does not count the viewer's own activity, a bot's, a commit or an unchanged PR", () => {
    const after = {
      ...old,
      activity: [
        item("comment", "me", day(6)),
        item("comment", "ci", day(6), "Bot"),
        item("commit", "bob", day(6)),
        item("comment", "bob", day(4)),
      ],
    };
    expect(newSinceRefresh([old], [after], "me")).toBe(0);
    expect(newSinceRefresh([old], [old], "me")).toBe(0);
  });

  it("counts a PR once, though it is in several lists, and nothing on a first load", () => {
    const fresh = pr({ id: "PR_a" });
    expect(newSinceRefresh([old], [fresh, fresh, old, old], "me")).toBe(1);
    expect(newSinceRefresh([], [fresh, old], "me")).toBe(0);
  });
});

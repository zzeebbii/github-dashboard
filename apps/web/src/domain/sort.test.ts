import { describe, expect, it } from "vitest";
import type { PullRequest } from "./pull-request.ts";
import { type SortKey, sortPullRequests } from "./sort.ts";

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
    mergeStateStatus: "UNKNOWN",
    reviewRequests: [],
    reviews: [],
    headCommittedAt: null,
    viewerReviewRequestedAt: null,
    activity: [],
    ...overrides,
  };
}

const day = (d: number): string => `2026-10-${String(d).padStart(2, "0")}T00:00:00Z`;
const me = { login: "me", typename: "User" };

const prs: readonly PullRequest[] = [
  // Review request: requested on day 3.
  pr({
    id: "a",
    createdAt: day(1),
    updatedAt: day(9),
    viewerReviewRequestedAt: day(3),
    additions: 50,
    deletions: 50,
  }),
  // Own PR: last push on day 2.
  pr({
    id: "b",
    author: me,
    createdAt: day(2),
    updatedAt: day(7),
    headCommittedAt: day(2),
    additions: 5,
    deletions: 0,
  }),
  // No request or push time: falls back to updatedAt (day 4).
  pr({ id: "c", createdAt: day(3), updatedAt: day(4), additions: 10, deletions: 10 }),
];

const cases: readonly [SortKey, readonly string[]][] = [
  ["waiting", ["b", "a", "c"]],
  ["updated", ["a", "b", "c"]],
  ["newest", ["c", "b", "a"]],
  ["smallest", ["b", "c", "a"]],
];

describe("sortPullRequests", () => {
  it.each(cases)("%s", (key, expected) => {
    expect(sortPullRequests(prs, key, "me").map((p) => p.id)).toEqual(expected);
  });

  it("does not mutate the input", () => {
    const before = prs.map((p) => p.id);
    sortPullRequests(prs, "smallest", "me");
    expect(prs.map((p) => p.id)).toEqual(before);
  });
});

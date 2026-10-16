import { describe, expect, it } from "vitest";
import type { PullRequest, Review } from "./pull-request.ts";
import { isRereviewDue } from "./rereview.ts";

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

const review = (login: string, submittedAt: string): Review => ({
  author: { login, typename: "User" },
  state: "APPROVED",
  submittedAt,
});

const day = (d: number): string => `2026-10-${String(d).padStart(2, "0")}T00:00:00Z`;

const cases: readonly [string, Partial<PullRequest>, boolean][] = [
  ["never reviewed, new commit", { headCommittedAt: day(5) }, false],
  ["review then new commit", { reviews: [review("me", day(3))], headCommittedAt: day(4) }, true],
  [
    "review then new request event",
    { reviews: [review("me", day(3))], viewerReviewRequestedAt: day(4) },
    true,
  ],
  [
    "review after both commit and request",
    { reviews: [review("me", day(5))], headCommittedAt: day(4), viewerReviewRequestedAt: day(4) },
    false,
  ],
  [
    "only the latest of several reviews counts",
    {
      reviews: [review("me", day(2)), review("me", day(6))],
      headCommittedAt: day(4),
    },
    false,
  ],
  [
    "someone else's review does not count",
    { reviews: [review("alice", day(3))], headCommittedAt: day(4) },
    false,
  ],
  [
    "login match is case-insensitive",
    { reviews: [review("ME", day(3))], headCommittedAt: day(4) },
    true,
  ],
  [
    "deleted-account review is ignored",
    {
      reviews: [{ author: null, state: "COMMENTED", submittedAt: day(3) }],
      headCommittedAt: day(4),
    },
    false,
  ],
  ["reviewed, nothing newer", { reviews: [review("me", day(3))] }, false],
];

describe("isRereviewDue", () => {
  it.each(cases)("%s", (_name, overrides, expected) => {
    expect(isRereviewDue(pr(overrides), "me")).toBe(expected);
  });
});

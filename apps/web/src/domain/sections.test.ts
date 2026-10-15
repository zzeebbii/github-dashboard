import { describe, expect, it } from "vitest";
import type { PullRequest, Viewer } from "./pull-request.ts";
import { placePullRequest, type Placement } from "./sections.ts";

// Zero mocks, zero I/O: plain data in, a placement out.

const viewer: Viewer = { login: "me", teams: ["acme/web"] };
const me = { login: "Me", typename: "User" };
const other = { login: "alice", typename: "User" };

function pr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: "PR_1",
    repository: "acme/app",
    number: 1,
    title: "A change",
    url: "https://github.com/acme/app/pull/1",
    author: other,
    labels: [],
    isDraft: false,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-02T00:00:00Z",
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

const mine = (overrides: Partial<PullRequest> = {}): PullRequest =>
  pr({ author: me, ...overrides });

const myReview = {
  author: me,
  state: "COMMENTED",
  submittedAt: "2026-10-03T00:00:00Z",
} as const;

const cases: readonly [string, PullRequest, Placement | null][] = [
  // Rule 1
  [
    "1: requested directly",
    pr({ reviewRequests: [{ kind: "user", login: "ME" }] }),
    { section: "needs-review", reason: { kind: "review-requested" } },
  ],
  [
    "1: requested via a team",
    pr({ reviewRequests: [{ kind: "team", team: "acme/web" }] }),
    { section: "needs-review", reason: { kind: "team-requested", team: "acme/web" } },
  ],
  [
    "1: requested via a team the viewer is not in",
    pr({ reviewRequests: [{ kind: "team", team: "acme/ops" }] }),
    null,
  ],
  [
    "1: re-review due beats the direct request chip",
    pr({
      reviews: [myReview],
      reviewRequests: [{ kind: "user", login: "me" }],
      viewerReviewRequestedAt: "2026-10-04T00:00:00Z",
    }),
    { section: "needs-review", reason: { kind: "re-requested" } },
  ],
  [
    "1: draft requesting the viewer still needs review",
    pr({ isDraft: true, reviewRequests: [{ kind: "user", login: "me" }] }),
    { section: "needs-review", reason: { kind: "review-requested" } },
  ],
  // Rule 2
  [
    "2: own PR with changes requested",
    mine({ reviewDecision: "CHANGES_REQUESTED" }),
    { section: "needs-action", reason: { kind: "changes-requested" } },
  ],
  [
    "2: precedence over failing CI",
    mine({ reviewDecision: "CHANGES_REQUESTED", checkState: "FAILURE" }),
    { section: "needs-action", reason: { kind: "changes-requested" } },
  ],
  [
    "2: drafts reach needs action through rule 2",
    mine({ isDraft: true, reviewDecision: "CHANGES_REQUESTED" }),
    { section: "needs-action", reason: { kind: "changes-requested" } },
  ],
  // Rule 3
  [
    "3: CI FAILURE",
    mine({ checkState: "FAILURE", mergeable: "CONFLICTING" }),
    { section: "needs-action", reason: { kind: "ci-failing" } },
  ],
  [
    "3: CI ERROR",
    mine({ checkState: "ERROR" }),
    { section: "needs-action", reason: { kind: "ci-failing" } },
  ],
  [
    "3: draft with failing CI waits",
    mine({ isDraft: true, checkState: "FAILURE" }),
    { section: "waiting", reason: { kind: "draft" } },
  ],
  // Rule 4
  [
    "4: merge conflicts",
    mine({ mergeable: "CONFLICTING", mergeStateStatus: "DIRTY" }),
    { section: "needs-action", reason: { kind: "merge-conflicts" } },
  ],
  [
    "4: draft with conflicts waits",
    mine({ isDraft: true, mergeable: "CONFLICTING" }),
    { section: "waiting", reason: { kind: "draft" } },
  ],
  // Rule 5
  [
    "5: ready to merge",
    mine({ checkState: "SUCCESS", mergeable: "MERGEABLE", mergeStateStatus: "CLEAN" }),
    { section: "needs-action", reason: { kind: "ready-to-merge" } },
  ],
  [
    "5: draft that is clean waits",
    mine({ isDraft: true, mergeStateStatus: "CLEAN" }),
    { section: "waiting", reason: { kind: "draft" } },
  ],
  // Rule 6
  [
    "6: CI running",
    mine({ checkState: "PENDING", mergeStateStatus: "BLOCKED" }),
    { section: "waiting", reason: { kind: "ci-running" } },
  ],
  [
    "6: CI expected",
    mine({ checkState: "EXPECTED" }),
    { section: "waiting", reason: { kind: "ci-running" } },
  ],
  [
    "6: awaiting review",
    mine({ reviewDecision: "REVIEW_REQUIRED", checkState: "SUCCESS", mergeStateStatus: "BLOCKED" }),
    { section: "waiting", reason: { kind: "awaiting-review" } },
  ],
  ["6: unknown state", mine(), { section: "waiting", reason: { kind: "awaiting-review" } }],
  // No rule
  ["someone else's PR, not requested", pr(), null],
  [
    "reviewed by me, not re-requested, not mine: dropped",
    pr({ reviews: [myReview], headCommittedAt: "2026-10-02T00:00:00Z" }),
    null,
  ],
  ["PR by a deleted account", pr({ author: null }), null],
];

describe("placePullRequest", () => {
  it.each(cases)("%s", (_name, input, expected) => {
    expect(placePullRequest(input, viewer)).toEqual(expected);
  });

  it("never puts a draft in needs action except via rule 2", () => {
    const checks = ["SUCCESS", "FAILURE", "ERROR", "PENDING", "EXPECTED", null] as const;
    const mergeables = ["MERGEABLE", "CONFLICTING", "UNKNOWN"] as const;
    const states = ["CLEAN", "DIRTY", "BLOCKED", "UNKNOWN"] as const;
    const decisions = ["APPROVED", "CHANGES_REQUESTED", "REVIEW_REQUIRED", null] as const;
    for (const checkState of checks)
      for (const mergeable of mergeables)
        for (const mergeStateStatus of states)
          for (const reviewDecision of decisions) {
            const placement = placePullRequest(
              mine({ isDraft: true, checkState, mergeable, mergeStateStatus, reviewDecision }),
              viewer,
            );
            const expected: Placement =
              reviewDecision === "CHANGES_REQUESTED"
                ? { section: "needs-action", reason: { kind: "changes-requested" } }
                : { section: "waiting", reason: { kind: "draft" } };
            expect(placement).toEqual(expected);
          }
  });
});

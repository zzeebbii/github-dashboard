import type { PullRequest } from "../../src/domain/pull-request.ts";

/** A plain open PR by `alice`; override what the test is about. */
export function aPullRequest(overrides: Partial<PullRequest> = {}): PullRequest {
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

import { isAuthoredBy, type PullRequest, toMillis } from "./pull-request.ts";

export type SortKey = "waiting" | "updated" | "newest" | "smallest";

/**
 * Waiting longest: for your PRs, time since the last push; for review requests,
 * time since the request. Falls back to the last update, like the design.
 */
function waitingSince(pr: PullRequest, viewerLogin: string): number {
  const at = isAuthoredBy(pr, viewerLogin) ? pr.headCommittedAt : pr.viewerReviewRequestedAt;
  return toMillis(at ?? pr.updatedAt);
}

/** Returns a sorted copy. Mirrors the design's `sortList`. */
export function sortPullRequests(
  prs: readonly PullRequest[],
  key: SortKey,
  viewerLogin: string,
): PullRequest[] {
  const compare: Record<SortKey, (a: PullRequest, b: PullRequest) => number> = {
    waiting: (a, b) => waitingSince(a, viewerLogin) - waitingSince(b, viewerLogin),
    updated: (a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt),
    newest: (a, b) => toMillis(b.createdAt) - toMillis(a.createdAt),
    smallest: (a, b) => a.additions + a.deletions - (b.additions + b.deletions),
  };
  return prs.toSorted(compare[key]);
}

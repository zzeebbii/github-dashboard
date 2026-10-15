import { type PullRequest, sameLogin, toMillis } from "./pull-request.ts";

/**
 * Re-requested: the viewer has submitted at least one review, and either the head
 * commit or the latest review request for the viewer is newer than that review.
 */
export function isRereviewDue(pr: PullRequest, viewerLogin: string): boolean {
  const own = pr.reviews.filter((r) => r.author !== null && sameLogin(r.author.login, viewerLogin));
  if (own.length === 0) return false;
  const latestReview = Math.max(...own.map((r) => toMillis(r.submittedAt)));
  return [pr.headCommittedAt, pr.viewerReviewRequestedAt].some(
    (at) => at !== null && toMillis(at) > latestReview,
  );
}

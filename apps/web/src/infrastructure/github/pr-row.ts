import type { ActivityItem, PullRequest, Review } from "../../domain/pull-request.ts";
import { sameLogin } from "../../domain/pull-request.ts";
import { actor, reviewRequest } from "./pr-detail.ts";
import type { ActivityNode, PrRow } from "./schemas/pr-row.ts";

// GitHub's spelling; a constant keeps no-underscore-dangle quiet, as in errors.ts.
const TYPENAME = "__typename";

/** Drops the null nodes a partial error leaves; the error itself is in `partialErrors`. */
const present = <T>(nodes: readonly (T | null)[]): T[] => nodes.filter((n): n is T => n !== null);

export function activityItem(node: ActivityNode): ActivityItem {
  return {
    kind: node[TYPENAME] === "IssueComment" ? "comment" : "review",
    author: actor(node.author),
    createdAt: node.createdAt,
  };
}

/** A PENDING review is the viewer's own unsubmitted draft: not a review yet. */
function reviews(row: PrRow): Review[] {
  return present(row.latestReviews?.nodes ?? []).flatMap((review) =>
    review.state === "PENDING" || review.submittedAt === null
      ? []
      : [{ state: review.state, submittedAt: review.submittedAt, author: actor(review.author) }],
  );
}

/**
 * A `PrRow` (schemas/pr-row.ts) as the domain's `PullRequest`. Shared by every list query.
 * `activity` holds what the row knows: its last comment or review and, when selected, the
 * head commit. The exact "+N new" items come from `getActivitySince`.
 */
export function toPullRequest(row: PrRow, viewerLogin: string): PullRequest {
  const headCommittedAt = row.commits?.nodes[0]?.commit.committedDate ?? null;
  const request = row.lastRequest?.nodes[0] ?? null;
  const requested = request?.requestedReviewer ?? null;
  const viewerRequested =
    requested?.[TYPENAME] === "User" &&
    requested.login !== undefined &&
    sameLogin(requested.login, viewerLogin);
  const activity = present(row.lastActivity.nodes).map(activityItem);
  return {
    id: row.id,
    repository: row.repository.nameWithOwner,
    number: row.number,
    title: row.title,
    url: row.url,
    author: actor(row.author),
    labels: present(row.labels?.nodes ?? []).map((label) => label.name),
    isDraft: row.isDraft,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    headSha: row.headRefOid,
    additions: row.additions,
    deletions: row.deletions,
    // Like GitHub's conversation count: comments plus reviews.
    commentCount: row.comments.totalCount + (row.reviews?.totalCount ?? 0),
    reviewDecision: row.reviewDecision,
    checkState: row.statusCheckRollup?.state ?? null,
    mergeable: row.mergeable,
    reviewRequests: present(row.reviewRequests?.nodes ?? []).flatMap((node) =>
      reviewRequest(node.requestedReviewer),
    ),
    reviews: reviews(row),
    headCommittedAt,
    viewerReviewRequestedAt: viewerRequested && request !== null ? request.createdAt : null,
    activity:
      headCommittedAt === null
        ? activity
        : [...activity, { kind: "commit", author: null, createdAt: headCommittedAt }],
  };
}

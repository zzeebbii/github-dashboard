/**
 * The PR list row: every BR-11 field, shared by every list query (Home's searches here, the
 * repository page's `pullRequests` in T21). Append it to a document and spread `...PrRow`
 * on a `PullRequest`; parse with schemas/pr-row.ts, map with pr-row.ts.
 *
 * Chosen by measurement (docs/architecture/github-query-costs.md): CI from
 * `PullRequest.statusCheckRollup` (not `commits(last:1)`), conflicts from `mergeable`, and
 * NEVER `mergeStateStatus` (≈ 0.3 s per PR; a list of 20 would time out). "+N new" needs only
 * the last comment or review here; the exact count is fetched lazily (activity-since).
 *
 * Measured 2026-10-16 in a Home search at `first: 20`, 1 point each: 3.1 s (org:vitejs),
 * 5.6–5.9 s (org:vercel, large monorepo PRs). Do not raise `first` above 20.
 *
 * ponytail: 10 labels, latest reviews and requests per row; a row with more shows the first 10.
 */
export const PR_ROW_FRAGMENT = `fragment PrRow on PullRequest {
  id
  number
  title
  url
  isDraft
  createdAt
  updatedAt
  headRefOid
  additions
  deletions
  repository { nameWithOwner }
  author { __typename login }
  labels(first: 10) { nodes { name } }
  reviewDecision
  mergeable
  statusCheckRollup { state }
  comments { totalCount }
  reviews { totalCount }
  latestReviews(first: 10) { nodes { state submittedAt author { __typename login } } }
  reviewRequests(first: 10) {
    nodes {
      requestedReviewer {
        __typename
        ... on User { login }
        ... on Team { slug organization { login } }
      }
    }
  }
  lastActivity: timelineItems(last: 1, itemTypes: [ISSUE_COMMENT, PULL_REQUEST_REVIEW]) {
    nodes {
      __typename
      ... on IssueComment { createdAt author { __typename login } }
      ... on PullRequestReview { createdAt author { __typename login } }
    }
  }
}`;

/**
 * The re-review inputs (FR-5.2): the head commit date and the latest review request. Only the
 * "reviewed by me" search selects them; `commits(last:1)` is the costly path, and re-review
 * needs a review of the viewer, which only that search guarantees. The other searches'
 * rows of the same PR are merged with it by node id.
 */
export const REREVIEW_FIELDS = `commits(last: 1) { nodes { commit { committedDate } } }
      lastRequest: timelineItems(last: 1, itemTypes: [REVIEW_REQUESTED_EVENT]) {
        nodes {
          ... on ReviewRequestedEvent {
            createdAt
            requestedReviewer { __typename ... on User { login } }
          }
        }
      }`;

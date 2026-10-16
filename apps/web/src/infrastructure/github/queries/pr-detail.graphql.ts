import type { GraphQLDocument } from "../client.ts";
import {
  type PullRequestChecksData,
  PullRequestChecksDataSchema,
  type PullRequestDetailData,
  PullRequestDetailDataSchema,
  type TimelinePageData,
  TimelinePageDataSchema,
} from "../schemas/pr-detail.ts";

/**
 * Comments and reviews, 50 per page (FR-6.2, AC-6.5). A constant, so both documents below
 * stay static strings (FR-3.14).
 *
 * Review threads are NOT requested here: `PULL_REQUEST_REVIEW_THREAD` is a valid item
 * type, but GitHub returned none for a PR with four review comments (recorded 2026-10-16,
 * vitejs/vite#22559), so threads come from `reviewThreads` instead.
 */
const TIMELINE = `timelineItems(first: 50, after: $after, itemTypes: [ISSUE_COMMENT, PULL_REQUEST_REVIEW]) {
        pageInfo { hasNextPage endCursor }
        nodes {
          __typename
          ... on IssueComment { id url createdAt bodyHTML author { __typename login } }
          ... on PullRequestReview { id url state submittedAt bodyHTML author { __typename login } }
        }
      }`;

/**
 * One pull request for the detail panel (FR-6.1, 6.2, 6.4): header, description as
 * GitHub-rendered `bodyHTML` (rendered only through ui/SafeHtml.tsx), details, review
 * threads with snippet and resolved state, and the first timeline page.
 *
 * Check runs are a separate document: they change without the PR's `updatedAt` changing,
 * so they have their own cache rule (FR-6.5).
 *
 * Cost: 1 point. Measured together with the checks document as one request: 2 points
 * (2026-10-16, vitejs/vite#22559); by GitHub's formula this document alone needs
 * 56 connection requests (4 lists + 1 thread list + 50 comment lists + 1 timeline) → 1.
 *
 * ponytail: 20 labels/assignees/reviewers, 50 review threads with 20 comments each, no
 * pagination of those; page them when a real PR hits a limit.
 */
const DETAIL_QUERY = `query PullRequestDetail($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      id
      number
      title
      url
      state
      isDraft
      bodyHTML
      createdAt
      updatedAt
      headRefOid
      headRefName
      baseRefName
      mergeable
      author { __typename login }
      labels(first: 20) { nodes { name color } }
      assignees(first: 20) { nodes { login } }
      milestone { title }
      reviewRequests(first: 20) {
        nodes {
          requestedReviewer {
            __typename
            ... on User { login }
            ... on Team { slug organization { login } }
          }
        }
      }
      latestReviews(first: 20) { nodes { state author { __typename login } } }
      reviewThreads(first: 50) {
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          comments(first: 20) {
            nodes { id url createdAt bodyHTML diffHunk author { __typename login } }
          }
        }
      }
      ${TIMELINE}
    }
  }
  rateLimit { cost limit remaining resetAt }
}`;

export const PullRequestDetailDocument: GraphQLDocument<
  { owner: string; name: string; number: number; after: null },
  PullRequestDetailData
> = { query: DETAIL_QUERY, schema: PullRequestDetailDataSchema };

/** "Load more": the next 50 timeline items after `after` (AC-6.5). Cost: 1 point. */
const TIMELINE_PAGE_QUERY = `query PullRequestTimeline($owner: String!, $name: String!, $number: Int!, $after: String!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      ${TIMELINE}
    }
  }
  rateLimit { cost limit remaining resetAt }
}`;

export const TimelinePageDocument: GraphQLDocument<
  { owner: string; name: string; number: number; after: string },
  TimelinePageData
> = { query: TIMELINE_PAGE_QUERY, schema: TimelinePageDataSchema };

/**
 * Every check run of one commit (FR-6.3), with the required flag (`isRequired`, GraphQL
 * only) and, for failing runs only, their annotations. This replaces the REST
 * `GET /commits/{sha}/check-runs` call: REST has no required flag and needs one more call
 * per failing run for annotations, so it cannot stay within 1 REST call (ADR-0017).
 * No logs are requested.
 *
 * Cost: 1 point by GitHub's formula: 1 suite list + 20 run lists + 20 failing-run lists +
 * 100 annotation lists = 141 requests / 100, rounded.
 *
 * ponytail: 20 suites, 50 runs each, annotations for the first 5 failing runs of a suite
 * (10 each); raise when a real PR shows more, each step costs points on every poll.
 */
const CHECKS_QUERY = `query PullRequestChecks($owner: String!, $name: String!, $number: Int!, $sha: GitObjectID!) {
  repository(owner: $owner, name: $name) {
    object(oid: $sha) {
      ... on Commit {
        checkSuites(first: 20) {
          nodes {
            app { name }
            checkRuns(first: 50) {
              nodes {
                databaseId
                name
                status
                conclusion
                startedAt
                completedAt
                detailsUrl
                title
                summary
                isRequired(pullRequestNumber: $number)
              }
            }
            failing: checkRuns(first: 5, filterBy: {conclusions: [ACTION_REQUIRED, FAILURE, STARTUP_FAILURE, TIMED_OUT]}) {
              nodes {
                databaseId
                annotations(first: 10) {
                  nodes {
                    path
                    annotationLevel
                    title
                    message
                    location { start { line } end { line } }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  rateLimit { cost limit remaining resetAt }
}`;

export const PullRequestChecksDocument: GraphQLDocument<
  { owner: string; name: string; number: number; sha: string },
  PullRequestChecksData
> = { query: CHECKS_QUERY, schema: PullRequestChecksDataSchema };

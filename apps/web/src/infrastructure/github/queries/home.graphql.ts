import { z } from "zod";
import type { GraphQLDocument } from "../client.ts";
import {
  ActivitySinceBlockSchema,
  type PrSearchData,
  PrSearchDataSchema,
} from "../schemas/pr-row.ts";
import { PR_ROW_FRAGMENT, REREVIEW_FIELDS } from "./pr-row.fragment.ts";

/**
 * Home's searches (FR-5.4): one page of 20 open PRs across every repository the token can
 * see, favourite or not (AC-5.4). The search string is a variable, but always one of the
 * constants in home.ts, never user input (FR-3.14).
 *
 * `first: 20` because GitHub stops a query after 10 s: 100 full rows time out, 20 answer in
 * 3–6 s for 1 point (measured 2026-10-16, docs/architecture/github-query-costs.md).
 */
const searchQuery = (rowFields: string) => `query HomeSearch($q: String!, $after: String) {
  search(type: ISSUE, query: $q, first: 20, after: $after) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes {
      __typename
      ... on PullRequest {
        ...PrRow
        ${rowFields}
      }
    }
  }
  rateLimit { cost limit remaining resetAt }
}
${PR_ROW_FRAGMENT}`;

type SearchVariables = { q: string; after: string | null };

/** `review-requested:@me` and `author:@me`: the row only. */
export const HomeSearchDocument: GraphQLDocument<SearchVariables, PrSearchData> = {
  query: searchQuery(""),
  schema: PrSearchDataSchema,
};

/**
 * `reviewed-by:@me -author:@me`: the row plus the re-review fields (FR-5.2). Measured
 * 2026-10-16 at 20 rows, 1 point: 4.2–6.3 s (org:vercel), against 5.6–5.9 s without them.
 */
export const HomeRereviewSearchDocument: GraphQLDocument<SearchVariables, PrSearchData> = {
  query: searchQuery(REREVIEW_FIELDS),
  schema: PrSearchDataSchema,
};

/** "+N new" asks about at most this many PRs per request. */
export const ACTIVITY_SINCE_PER_REQUEST = 10;
const SLOTS = Array.from({ length: ACTIVITY_SINCE_PER_REQUEST }, (_, i) => i);

/**
 * The exact "+N new" input (FR-5.3) for up to 10 PRs: their comments and reviews since each
 * one's seen marker. Ten fixed aliased blocks, each switched off with `@include` when unused,
 * so the document stays one static string. Replies to review threads are reviews too, so
 * `PULL_REQUEST_REVIEW` covers them.
 *
 * Measured 2026-10-16 on vercel/next.js PRs: 0.85 s for 10 blocks, 1.3 s for this exact
 * document with 9 used and 1 switched off (that alias is absent from `data`); 1 point each.
 *
 * ponytail: 50 items per PR since the marker; "+50 new" is plenty of signal.
 */
const ACTIVITY_SINCE_QUERY = `query ActivitySince(${SLOTS.map(
  (i) =>
    `$use${i}: Boolean!, $owner${i}: String!, $name${i}: String!, $number${i}: Int!, $since${i}: DateTime!`,
).join(", ")}) {
${SLOTS.map(
  (i) => `  a${i}: repository(owner: $owner${i}, name: $name${i}) @include(if: $use${i}) {
    pullRequest(number: $number${i}) {
      id
      timelineItems(since: $since${i}, first: 50, itemTypes: [ISSUE_COMMENT, PULL_REQUEST_REVIEW]) {
        nodes {
          __typename
          ... on IssueComment { createdAt author { __typename login } }
          ... on PullRequestReview { createdAt author { __typename login } }
        }
      }
    }
  }`,
).join("\n")}
  rateLimit { cost limit remaining resetAt }
}`;

const ActivitySinceDataSchema = z.object(
  Object.fromEntries(SLOTS.map((i) => [`a${i}`, ActivitySinceBlockSchema.optional()])),
);
export type ActivitySinceData = z.infer<typeof ActivitySinceDataSchema>;

export const ActivitySinceDocument: GraphQLDocument<
  Record<string, string | number | boolean>,
  ActivitySinceData
> = { query: ACTIVITY_SINCE_QUERY, schema: ActivitySinceDataSchema };

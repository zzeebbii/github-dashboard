import type { GraphQLDocument } from "../client.ts";
import { type RepoPullRequestsData, RepoPullRequestsDataSchema } from "../schemas/pr-row.ts";
import { PR_ROW_FRAGMENT } from "./pr-row.fragment.ts";

/**
 * The repository page (FR-4.6): its header (name, visibility, description, URL, open-PR
 * count) and one page of 20 of its OPEN pull requests, most recently updated first, as full
 * rows. Closed and merged PRs are never requested (AC-4.5). Owner and name were validated by
 * the route (FR-3.14) and are variables, never spliced in.
 *
 * `first: 20` like every list (docs/architecture/github-query-costs.md). The header repeats
 * on later pages; it costs nothing next to the rows. 1 point per page.
 */
const QUERY = `query RepoPullRequests($owner: String!, $name: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    id
    nameWithOwner
    visibility
    description
    url
    pullRequests(states: OPEN, orderBy: {field: UPDATED_AT, direction: DESC}, first: 20, after: $after) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        __typename
        ...PrRow
      }
    }
  }
  rateLimit { cost limit remaining resetAt }
}
${PR_ROW_FRAGMENT}`;

export const RepoPullRequestsDocument: GraphQLDocument<
  { owner: string; name: string; after: string | null },
  RepoPullRequestsData
> = { query: QUERY, schema: RepoPullRequestsDataSchema };

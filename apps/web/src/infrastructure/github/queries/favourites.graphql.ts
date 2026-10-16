import type { GraphQLDocument } from "../client.ts";
import { type FavouritesData, FavouritesDataSchema } from "../schemas/favourites.ts";

/**
 * Up to 25 favourite repositories by node id (FR-4.5, FR-4.7): each one's current
 * `nameWithOwner` (a rename follows the id), its open-PR count, and its 20 most recently
 * updated OPEN pull requests. Closed and merged PRs are never requested (AC-4.5). A
 * deleted repository's node is null, with a NOT_FOUND error on its path.
 *
 * Each PR carries `updatedAt` and its head SHA, so opening it hits the detail cache
 * (T22) when nothing changed.
 *
 * Why not every BR-11 field here: GitHub stops a query after about 10 s of server time,
 * and the full row (review decision, mergeability, diff size, CI rollup, timeline) costs
 * roughly 0.2–0.4 s per PR. Measured 2026-10-16 against 25 public repositories: the
 * full row timed out (HTTP 502) even at ONE PR per repository; these fields at 20 PRs per
 * repository answered in 2–3 s. Full rows come from the repository page's own query
 * (T21) and Home's searches (T20), which return far fewer PRs per request.
 *
 * Cost: 1 point per batch of 25 (25 PR lists, no connections below them: 25 requests /
 * 100, rounded up to the minimum of 1); measured 1, three times. So 60 favourites cost
 * 3 requests and 3 points per refresh (AC-3.1), 36 points an hour (AC-3.2).
 *
 * ponytail: the 20 newest open PRs per repository; `totalCount` keeps the sidebar count
 * right beyond that.
 */
const QUERY = `query Favourites($ids: [ID!]!) {
  nodes(ids: $ids) {
    __typename
    ... on Repository {
      id
      nameWithOwner
      pullRequests(states: OPEN, first: 20, orderBy: {field: UPDATED_AT, direction: DESC}) {
        totalCount
        nodes {
          id
          number
          title
          url
          isDraft
          createdAt
          updatedAt
          headRefOid
          author { __typename login }
        }
      }
    }
  }
  rateLimit { cost limit remaining resetAt }
}`;

export const FavouritesDocument: GraphQLDocument<{ ids: readonly string[] }, FavouritesData> = {
  query: QUERY,
  schema: FavouritesDataSchema,
};

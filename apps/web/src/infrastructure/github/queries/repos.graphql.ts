import type { GraphQLDocument } from "../client.ts";
import {
  type OrganizationRepositoriesData,
  OrganizationRepositoriesDataSchema,
  type RepositoriesData,
  RepositoriesDataSchema,
  type ViewerRepositoriesData,
  ViewerRepositoriesDataSchema,
} from "../schemas/repos.ts";

/** One page of 100 repositories. A constant, so every document stays static (FR-3.14). */
const PAGE = `pageInfo { hasNextPage endCursor }
      nodes { id nameWithOwner visibility description }`;

/**
 * Every repository the account can reach (FR-4.1), first pages only: the viewer's own
 * 100 and, nested, the first 100 of each of the viewer's organisations, in ONE request.
 * `__typename` on each organisation lets the error mapper name the one an SSO or token
 * policy error points into, while the others' repositories still load (FR-3.10).
 *
 * Requests (AC-4.1): this one, then one per further page of any single connection
 * (documents below). With the viewer and 3 organisations that is 1 + Σ(⌈nᵢ/100⌉ − 1):
 * 450 repositories over 4 connections need at most ⌊(450 − 4)/100⌋ = 4 more, so ≤ 5.
 *
 * Cost: 1 point by GitHub's formula (1 organisation list + 100 repository lists +
 * 1 viewer list = 102 requests / 100, rounded); measured 1 (2026-10-16, on an account
 * without organisations, in about 1 s).
 *
 * ponytail: the first 100 organisations, as in viewer.graphql.ts.
 */
const QUERY = `query Repositories {
  viewer {
    repositories(first: 100) {
      ${PAGE}
    }
    organizations(first: 100) {
      nodes {
        __typename
        login
        repositories(first: 100) {
          ${PAGE}
        }
      }
    }
  }
  rateLimit { cost limit remaining resetAt }
}`;

export const RepositoriesDocument: GraphQLDocument<Record<string, never>, RepositoriesData> = {
  query: QUERY,
  schema: RepositoriesDataSchema,
};

/** The viewer's next 100 repositories. Cost: 1 point. */
const VIEWER_PAGE_QUERY = `query ViewerRepositories($after: String!) {
  viewer {
    repositories(first: 100, after: $after) {
      ${PAGE}
    }
  }
  rateLimit { cost limit remaining resetAt }
}`;

export const ViewerRepositoriesDocument: GraphQLDocument<
  { after: string },
  ViewerRepositoriesData
> = { query: VIEWER_PAGE_QUERY, schema: ViewerRepositoriesDataSchema };

/** One organisation's next 100 repositories. Cost: 1 point. */
const ORGANIZATION_PAGE_QUERY = `query OrganizationRepositories($login: String!, $after: String!) {
  organization(login: $login) {
    __typename
    login
    repositories(first: 100, after: $after) {
      ${PAGE}
    }
  }
  rateLimit { cost limit remaining resetAt }
}`;

export const OrganizationRepositoriesDocument: GraphQLDocument<
  { login: string; after: string },
  OrganizationRepositoriesData
> = { query: ORGANIZATION_PAGE_QUERY, schema: OrganizationRepositoriesDataSchema };

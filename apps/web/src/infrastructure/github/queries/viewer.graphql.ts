import type { GraphQLDocument } from "../client.ts";
import { type ViewerData, ViewerDataSchema } from "../schemas/viewer.ts";

/**
 * The viewer, their organisations, and their teams in each. `userLogins` limits teams to
 * the viewer's own, so it takes the viewer's login as a variable.
 *
 * Cost: 1 point (recorded 2026-10-16). `__typename` lets the error mapper tell which
 * organisation a partial error path points into.
 *
 * ponytail: first 100 organisations and 100 teams each, no pagination; page when a real
 * account hits either.
 */
const QUERY = `query Viewer($login: String!) {
  viewer {
    login
    name
    avatarUrl
    organizations(first: 100) {
      nodes {
        __typename
        login
        name
        avatarUrl
        teams(first: 100, userLogins: [$login]) { nodes { slug } }
      }
    }
  }
  rateLimit { cost limit remaining resetAt }
}`;

export const ViewerDocument: GraphQLDocument<{ login: string }, ViewerData> = {
  query: QUERY,
  schema: ViewerDataSchema,
};

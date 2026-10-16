import type { GitHubReadPort, HomeSearch } from "../../application/github.ts";
import type { GitHubClient } from "./client.ts";
import { activityItem, toPullRequest } from "./pr-row.ts";
import {
  ACTIVITY_SINCE_PER_REQUEST,
  ActivitySinceDocument,
  HomeRereviewSearchDocument,
  HomeSearchDocument,
} from "./queries/home.graphql.ts";
import type { PrRow } from "./schemas/pr-row.ts";

/** FR-5.4's search strings, the only ones Home ever sends. */
const SEARCHES = {
  "review-requested": { q: "is:pr is:open review-requested:@me", document: HomeSearchDocument },
  authored: { q: "is:pr is:open author:@me", document: HomeSearchDocument },
  "reviewed-by": {
    q: "is:pr is:open reviewed-by:@me -author:@me",
    document: HomeRereviewSearchDocument,
  },
} as const satisfies Record<HomeSearch, unknown>;

// GitHub's spelling; a constant keeps no-underscore-dangle quiet, as in errors.ts.
const TYPENAME = "__typename";

const isPullRequest = (node: { readonly [TYPENAME]: string } | null): node is PrRow =>
  node !== null && node[TYPENAME] === "PullRequest";

/** The Home half of the `GitHubReadPort` adapter (FR-5.3, FR-5.4). */
export function createHomeRead(
  client: GitHubClient,
): Pick<GitHubReadPort, "searchHome" | "getActivitySince"> {
  return {
    async searchHome(accountId, viewerLogin, search, after) {
      const { q, document } = SEARCHES[search];
      const result = await client.graphql(accountId, document, { q, after });
      if (!result.ok) return result;
      const { issueCount, pageInfo, nodes } = result.value.data.search;
      return {
        ok: true,
        value: {
          data: {
            pullRequests: nodes.filter(isPullRequest).map((row) => toPullRequest(row, viewerLogin)),
            nextCursor: pageInfo.hasNextPage ? pageInfo.endCursor : null,
            totalCount: issueCount,
          },
          partialErrors: result.value.partialErrors,
        },
      };
    },

    async getActivitySince(accountId, requests) {
      if (requests.length > ACTIVITY_SINCE_PER_REQUEST) {
        throw new Error(`At most ${ACTIVITY_SINCE_PER_REQUEST} PRs per request.`);
      }
      // Unused slots are switched off; their values only satisfy the variable types.
      const variables: Record<string, string | number | boolean> = {};
      for (let i = 0; i < ACTIVITY_SINCE_PER_REQUEST; i += 1) {
        const request = requests[i];
        const [owner = "", name = ""] = request?.repository.split("/") ?? [];
        variables[`use${i}`] = request !== undefined;
        variables[`owner${i}`] = owner;
        variables[`name${i}`] = name;
        variables[`number${i}`] = request?.number ?? 1;
        variables[`since${i}`] = request?.since ?? "1970-01-01T00:00:00Z";
      }
      const result = await client.graphql(accountId, ActivitySinceDocument, variables);
      if (!result.ok) return result;
      const { data } = result.value;
      return {
        ok: true,
        value: {
          data: requests.map((_, i) => {
            const pullRequest = data[`a${i}`]?.pullRequest ?? null;
            if (pullRequest === null) return null;
            return pullRequest.timelineItems.nodes.flatMap((node) =>
              node === null ? [] : [activityItem(node)],
            );
          }),
          partialErrors: result.value.partialErrors,
        },
      };
    },
  };
}

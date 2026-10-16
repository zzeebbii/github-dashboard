import type { GitHubReadPort } from "../../application/github.ts";
import type { GitHubClient } from "./client.ts";
import { toPullRequest } from "./pr-row.ts";
import { RepoPullRequestsDocument } from "./queries/repo-pull-requests.graphql.ts";

/** The repository page half of the `GitHubReadPort` adapter (FR-4.6, AC-4.5). */
export function createRepoPullRequestsRead(
  client: GitHubClient,
): Pick<GitHubReadPort, "listRepoPullRequests"> {
  return {
    async listRepoPullRequests(accountId, viewerLogin, { owner, name }, after) {
      const result = await client.graphql(accountId, RepoPullRequestsDocument, {
        owner,
        name,
        after,
      });
      if (!result.ok) return result;
      const { repository } = result.value.data;
      // A missing or hidden repository is null beside its error: that error is the answer.
      if (repository === null) {
        return { ok: false, error: result.value.partialErrors[0] ?? { kind: "notFound" } };
      }
      const { pullRequests, ...detail } = repository;
      return {
        ok: true,
        value: {
          data: {
            repository: detail,
            page: {
              pullRequests: pullRequests.nodes.flatMap((row) =>
                row === null ? [] : [toPullRequest(row, viewerLogin)],
              ),
              nextCursor: pullRequests.pageInfo.hasNextPage
                ? pullRequests.pageInfo.endCursor
                : null,
              totalCount: pullRequests.totalCount,
            },
          },
          partialErrors: result.value.partialErrors,
        },
      };
    },
  };
}

import type { GitHubReadPort } from "../../application/github.ts";
import type { GitHubClient } from "./client.ts";
import { createFavouritesRead } from "./favourites.ts";
import { createHomeRead } from "./home.ts";
import { createPullRequestDetailRead } from "./pr-detail.ts";
import { ViewerDocument } from "./queries/viewer.graphql.ts";
import { createRepoPullRequestsRead } from "./repo-pull-requests.ts";
import { createRepositoryRead } from "./repos.ts";

/** The `GitHubReadPort` adapter: runs the static documents and maps data onto port types. */
export function createGitHubRead(client: GitHubClient): GitHubReadPort {
  return {
    ...createPullRequestDetailRead(client),
    ...createRepositoryRead(client),
    ...createFavouritesRead(client),
    ...createHomeRead(client),
    ...createRepoPullRequestsRead(client),
    async viewer(account) {
      const result = await client.graphql(account.id, ViewerDocument, { login: account.login });
      if (!result.ok) return result;
      const { viewer } = result.value.data;
      return {
        ok: true,
        value: {
          data: {
            login: viewer.login,
            name: viewer.name,
            avatarUrl: viewer.avatarUrl,
            // An organisation GitHub nulled out is reported in partialErrors instead.
            organizations: viewer.organizations.nodes.flatMap((org) =>
              org === null
                ? []
                : [
                    {
                      login: org.login,
                      name: org.name,
                      avatarUrl: org.avatarUrl,
                      teams: (org.teams?.nodes ?? []).flatMap((team) =>
                        team === null ? [] : [team.slug],
                      ),
                    },
                  ],
            ),
          },
          partialErrors: result.value.partialErrors,
        },
      };
    },
  };
}

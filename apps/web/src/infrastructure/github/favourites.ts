import type { GitHubReadPort } from "../../application/github.ts";
import { FAVOURITES_PER_REQUEST, type FavouriteLookup } from "../../domain/favourites.ts";
import type { GitHubClient } from "./client.ts";
import { FavouritesDocument } from "./queries/favourites.graphql.ts";
import type { RepositoryNode } from "./schemas/favourites.ts";

// GitHub's spelling; a constant keeps no-underscore-dangle quiet, as in errors.ts.
const TYPENAME = "__typename";

/** The schema only lets a "Repository" node through with every repository field. */
const isRepository = (node: { readonly [TYPENAME]: string }): node is RepositoryNode =>
  node[TYPENAME] === "Repository";

/** The favourites half of the `GitHubReadPort` adapter (FR-4.5, FR-4.7). */
export function createFavouritesRead(
  client: GitHubClient,
): Pick<GitHubReadPort, "refreshFavourites"> {
  return {
    async refreshFavourites(accountId, nodeIds) {
      if (nodeIds.length > FAVOURITES_PER_REQUEST) {
        throw new Error(`At most ${FAVOURITES_PER_REQUEST} favourites per request (FR-4.5).`);
      }
      const result = await client.graphql(accountId, FavouritesDocument, { ids: [...nodeIds] });
      if (!result.ok) return result;
      const { nodes } = result.value.data;
      // A deleted repository comes back as a null node with a NOT_FOUND error, which the
      // lookup itself now says. Any other error (SSO, token policy) may have hidden a node
      // too, and the client does not keep error paths, so then a null node is "unknown"
      // rather than "missing": a favourite is never marked unavailable for an access issue.
      const partialErrors = result.value.partialErrors.filter((e) => e.kind !== "notFound");
      const nullMeans = partialErrors.length === 0 ? "missing" : "unknown";
      const lookups = nodeIds.map((nodeId, i): FavouriteLookup => {
        const node = nodes[i] ?? null;
        if (node === null) return { kind: nullMeans, nodeId };
        // The id now names something other than a repository.
        if (!isRepository(node)) return { kind: "missing", nodeId };
        return {
          kind: "found",
          nodeId,
          nameWithOwner: node.nameWithOwner,
          openCount: node.pullRequests.totalCount,
          pullRequests: node.pullRequests.nodes.flatMap((pr) =>
            pr === null
              ? []
              : [
                  {
                    id: pr.id,
                    repository: node.nameWithOwner,
                    number: pr.number,
                    title: pr.title,
                    url: pr.url,
                    isDraft: pr.isDraft,
                    author:
                      pr.author === null
                        ? null
                        : { login: pr.author.login, typename: pr.author[TYPENAME] },
                    createdAt: pr.createdAt,
                    updatedAt: pr.updatedAt,
                    headSha: pr.headRefOid,
                  },
                ],
          ),
        };
      });
      return { ok: true, value: { data: lookups, partialErrors } };
    },
  };
}

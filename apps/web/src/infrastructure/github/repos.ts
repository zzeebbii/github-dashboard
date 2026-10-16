import type { GitHubError, GitHubReadPort } from "../../application/github.ts";
import type { AccountId } from "../../domain/account.ts";
import type { Repository } from "../../domain/favourites.ts";
import type { GitHubClient } from "./client.ts";
import {
  OrganizationRepositoriesDocument,
  RepositoriesDocument,
  ViewerRepositoriesDocument,
} from "./queries/repos.graphql.ts";
import type { RepositoryPage } from "./schemas/repos.ts";

/** Which connection a further page belongs to: the viewer's, or one organisation's. */
type Connection = { readonly org: string | null; readonly after: string };

const nextPage = (org: string | null, page: RepositoryPage): Connection[] =>
  page.pageInfo.hasNextPage && page.pageInfo.endCursor !== null
    ? [{ org, after: page.pageInfo.endCursor }]
    : [];

/** The repository list half of the `GitHubReadPort` adapter (FR-4.1, AC-4.1). */
export function createRepositoryRead(client: GitHubClient): Pick<GitHubReadPort, "listRepos"> {
  async function page(accountId: AccountId, at: Connection) {
    if (at.org === null) {
      const result = await client.graphql(accountId, ViewerRepositoriesDocument, {
        after: at.after,
      });
      return result.ok ? { ...result, page: result.value.data.viewer.repositories } : result;
    }
    const result = await client.graphql(accountId, OrganizationRepositoriesDocument, {
      login: at.org,
      after: at.after,
    });
    if (!result.ok) return result;
    const repositories = result.value.data.organization?.repositories;
    if (repositories === null || repositories === undefined) {
      return { ok: false, error: result.value.partialErrors[0] ?? { kind: "notFound" } } as const;
    }
    return { ...result, page: repositories };
  }

  return {
    async listRepos(accountId) {
      const first = await client.graphql(accountId, RepositoriesDocument, {});
      if (!first.ok) return first;
      const { viewer } = first.value.data;
      const pages: RepositoryPage[] = [viewer.repositories];
      const pending: Connection[] = nextPage(null, viewer.repositories);
      // An organisation GitHub nulled out is in partialErrors as `orgAccess` (FR-3.10).
      for (const org of viewer.organizations.nodes) {
        if (org === null || org.repositories === null) continue;
        pages.push(org.repositories);
        pending.push(...nextPage(org.login, org.repositories));
      }
      const partialErrors: GitHubError[] = [...first.value.partialErrors];

      // Further pages one at a time (FR-3.8). A failed page fails the whole list: a list
      // missing repositories must not be cached for 24 hours as if it were complete.
      for (let at = pending.shift(); at !== undefined; at = pending.shift()) {
        // oxlint-disable-next-line no-await-in-loop -- reason: each page needs the cursor of the one before, and FR-3.8 runs requests one after another
        const result = await page(accountId, at);
        if (!result.ok) return result;
        pages.push(result.page);
        partialErrors.push(...result.value.partialErrors);
        pending.push(...nextPage(at.org, result.page));
      }

      // A repository can arrive twice: the viewer's collaborator repos include org repos.
      const byId = new Map<string, Repository>();
      for (const repo of pages.flatMap((p) => p.nodes)) {
        if (repo !== null && !byId.has(repo.id)) byId.set(repo.id, repo);
      }
      return { ok: true, value: { data: [...byId.values()], partialErrors } };
    },
  };
}

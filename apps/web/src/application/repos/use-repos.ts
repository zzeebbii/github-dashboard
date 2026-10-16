import { type QueryClient, queryOptions, useQuery } from "@tanstack/react-query";
import type { AccountId } from "../../domain/account.ts";
import type { Repository } from "../../domain/favourites.ts";
import type { GitHubError, GitHubReadPort, OrgAccessIssue } from "../github.ts";
import { useGitHub } from "../github-provider.tsx";
import { type GitHubQueryError, unwrap } from "../pr/use-pr-detail.ts";
import { OWN_REFRESH_ONLY } from "../refresh-scheduler.ts";

/**
 * Query keys of the repository list, in one place so a key is never retyped. Keys are
 * `[store, accountId, ...]`, so the list is persisted in the `repos` store and restored
 * on reload (query-hydration.ts).
 */
const repoKeys = {
  all: (accountId: AccountId) => ["repos", accountId] as const,
  list: (accountId: AccountId) => [...repoKeys.all(accountId), "list"] as const,
};

/** FR-4.1: the list is loaded once and kept 24 hours. */
const REPO_LIST_STALE_MS = 24 * 60 * 60 * 1000;

interface RepoList {
  readonly repositories: readonly Repository[];
  /** Organisations whose repositories GitHub would not show (FR-3.10, T17). */
  readonly partialErrors: readonly GitHubError[];
}

/**
 * Fresh for 24 h, also across reloads (hydration keeps `fetchedAt`), and outside the
 * refresh schedule (`OWN_REFRESH_ONLY`), so only `refresh()` refetches it sooner (AC-4.1).
 */
export function reposQueryOptions(github: GitHubReadPort, accountId: AccountId) {
  return queryOptions<RepoList, GitHubQueryError>({
    queryKey: repoKeys.list(accountId),
    queryFn: async () => {
      const { data, partialErrors } = await unwrap(github.listRepos(accountId));
      return { repositories: data, partialErrors };
    },
    staleTime: REPO_LIST_STALE_MS,
    meta: OWN_REFRESH_ONLY,
  });
}

/** The cached list only; never a request (the command palette, AC-7.1). */
export const cachedRepositories = (client: QueryClient, accountId: AccountId) =>
  client.getQueryData<RepoList>(repoKeys.list(accountId))?.repositories ?? [];

const orgIssue = (error: GitHubError): OrgAccessIssue[] =>
  error.kind === "orgAccess" ? [error.issue] : [];

/** An account's repositories, the organisations it cannot see, and a manual refresh. */
export function useRepos(accountId: AccountId) {
  const query = useQuery(reposQueryOptions(useGitHub(), accountId));
  return {
    query,
    repositories: query.data?.repositories ?? [],
    orgAccessIssues: (query.data?.partialErrors ?? []).flatMap(orgIssue),
    /** The sidebar's refresh button: the only way to reload the list within 24 h. */
    refresh: (): void => {
      void query.refetch();
    },
  };
}

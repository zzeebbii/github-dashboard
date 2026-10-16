import { type QueryClient, queryOptions, useQueries } from "@tanstack/react-query";
import { useEffect } from "react";
import type { AccountId } from "../../domain/account.ts";
import {
  type FavouriteLookup,
  type OpenPullRequest,
  type Repository,
  batchesOf,
  reconcileFavourites,
  showsRefreshCostNotice,
} from "../../domain/favourites.ts";
import { useFavouriteStore } from "../auth-provider.tsx";
import type { GitHubError, GitHubReadPort } from "../github.ts";
import { useGitHub } from "../github-provider.tsx";
import { type GitHubQueryError, unwrap } from "../pr/use-pr-detail.ts";

/**
 * Query keys of the favourites refresh, in one place. One query per batch of 25 node ids
 * (FR-4.5), keyed `["prLists", accountId, "favourites", ids]`: persisted and restored on
 * reload, and refreshed on the T14 schedule like every key of the active account, one
 * batch after another. 60 favourites are 3 queries, so 3 requests (AC-3.1).
 *
 * ponytail: removing a favourite shifts the later batches, so they refetch once; key
 * batches by a stable slot if that ever shows in the quota.
 */
const favouriteKeys = {
  all: (accountId: AccountId) => ["prLists", accountId, "favourites"] as const,
  batch: (accountId: AccountId, nodeIds: readonly string[]) =>
    [...favouriteKeys.all(accountId), nodeIds] as const,
};

interface FavouriteBatch {
  readonly lookups: readonly FavouriteLookup[];
  readonly partialErrors: readonly GitHubError[];
}

/** The open PRs of every cached favourites batch; never a request (the command palette, AC-7.1). */
export const cachedFavouritePullRequests = (
  client: QueryClient,
  accountId: AccountId,
): OpenPullRequest[] =>
  client
    .getQueriesData<FavouriteBatch>({ queryKey: favouriteKeys.all(accountId) })
    .flatMap(([, data]) => data?.lookups ?? [])
    .flatMap((lookup) => (lookup.kind === "found" ? lookup.pullRequests : []));

export function favouriteBatchQueryOptions(
  github: GitHubReadPort,
  accountId: AccountId,
  nodeIds: readonly string[],
) {
  return queryOptions<FavouriteBatch, GitHubQueryError>({
    queryKey: favouriteKeys.batch(accountId, nodeIds),
    queryFn: async () => {
      const { data, partialErrors } = await unwrap(github.refreshFavourites(accountId, nodeIds));
      return { lookups: data, partialErrors };
    },
  });
}

/**
 * An account's favourites with their open PRs (FR-4.4–4.8). A rename found by a refresh is
 * saved silently; a favourite whose id no longer resolves is `unavailable` (AC-4.4).
 */
export function useFavourites(accountId: AccountId) {
  const github = useGitHub();
  const { favourites, setFavourites } = useFavouriteStore(accountId);
  const batches = useQueries({
    queries: batchesOf(favourites.map((f) => f.nodeId)).map((ids) =>
      favouriteBatchQueryOptions(github, accountId, ids),
    ),
  });
  const { statuses, renamed } = reconcileFavourites(
    favourites,
    batches.flatMap((batch) => batch.data?.lookups ?? []),
  );

  useEffect(() => {
    if (renamed) setFavourites(statuses.map((status) => status.favourite));
  }, [renamed, statuses, setFavourites]);

  const isFavourite = (nodeId: string) => favourites.some((f) => f.nodeId === nodeId);
  const remove = (nodeId: string): void => {
    setFavourites(favourites.filter((f) => f.nodeId !== nodeId));
  };

  return {
    statuses,
    /** FR-4.8: the sidebar shows a notice about refresh cost (T17). */
    showCostNotice: showsRefreshCostNotice(favourites.length),
    /** SSO and policy errors of the favourites GitHub would not show. */
    partialErrors: batches.flatMap((batch) => batch.data?.partialErrors ?? []),
    isFetching: batches.some((batch) => batch.isFetching),
    isFavourite,
    /** The star on sidebar rows and the repository page (AC-4.3). */
    toggle(repository: Pick<Repository, "id" | "nameWithOwner">): void {
      if (isFavourite(repository.id)) remove(repository.id);
      else {
        setFavourites([
          ...favourites,
          { nodeId: repository.id, nameWithOwner: repository.nameWithOwner },
        ]);
      }
    },
    /** "Remove" on an unavailable favourite (FR-4.7). */
    remove,
  };
}

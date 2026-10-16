import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { AccountId } from "../domain/account.ts";
import type { Repository } from "../domain/favourites.ts";
import type { PullRequest } from "../domain/pull-request.ts";
import { cachedHomePullRequests } from "./home/use-home.ts";
import { cachedFavouritePullRequests } from "./repos/use-favourites.ts";
import { cachedRepoPullRequests } from "./repos/use-repo-page.ts";
import { cachedRepositories } from "./repos/use-repos.ts";

/** What the palette shows of a PR: favourites batches carry no more than this. */
type PalettePullRequest = Pick<PullRequest, "id" | "repository" | "number" | "title" | "isDraft">;

interface CachedSearchData {
  readonly repositories: readonly Repository[];
  readonly pullRequests: readonly PalettePullRequest[];
}

/**
 * The account's repositories and PRs as the query cache holds them when the palette opens
 * (FR-7.1). Only reads the cache: never a query, so never a request (AC-7.1). PRs found in
 * several lists appear once.
 */
export function useCachedSearchData(accountId: AccountId): CachedSearchData {
  const client = useQueryClient();
  // A snapshot for as long as the palette is open: results do not move while typing.
  const [data] = useState((): CachedSearchData => {
    const byId = new Map<string, PalettePullRequest>();
    for (const pr of [
      ...cachedHomePullRequests(client, accountId),
      ...cachedRepoPullRequests(client, accountId),
      ...cachedFavouritePullRequests(client, accountId),
    ]) {
      if (!byId.has(pr.id)) byId.set(pr.id, pr);
    }
    return {
      repositories: cachedRepositories(client, accountId),
      pullRequests: [...byId.values()],
    };
  });
  return data;
}

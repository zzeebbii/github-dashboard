import {
  type InfiniteData,
  type QueryClient,
  infiniteQueryOptions,
  useInfiniteQuery,
} from "@tanstack/react-query";
import type { Account, AccountId } from "../../domain/account.ts";
import type { PullRequest } from "../../domain/pull-request.ts";
import { REFRESH_INTERVAL_MS } from "../../domain/quota.ts";
import type { GitHubError, GitHubReadPort, RepoPullRequestPage } from "../github.ts";
import { useGitHub } from "../github-provider.tsx";
import { type GitHubQueryError, unwrap } from "../pr/use-pr-detail.ts";

interface RepoPage extends RepoPullRequestPage {
  readonly partialErrors: readonly GitHubError[];
}

interface RepoRef {
  readonly owner: string;
  readonly name: string;
}

const repoPagesKey = (accountId: AccountId) => ["prLists", accountId, "repo"] as const;

/** Every cached repository-page PR; never a request (the command palette, AC-7.1). */
export const cachedRepoPullRequests = (client: QueryClient, accountId: AccountId) =>
  client
    .getQueriesData<InfiniteData<RepoPage>>({ queryKey: repoPagesKey(accountId) })
    .flatMap(([, data]) => data?.pages.flatMap((page) => page.page.pullRequests) ?? []);

/**
 * The repository page's open PRs, 20 per page (FR-4.6). Keyed `["prLists", accountId, "repo",
 * owner/name]`, so it is persisted, restored on reload and refreshed on the T14 schedule for
 * the active account; a refresh refetches every loaded page, one request each. Fresh until
 * the next scheduled refresh, so a revisit within it makes no request. GitHub names are
 * case-insensitive, so the key is lower-cased.
 */
export function repoPullRequestsQueryOptions(
  github: GitHubReadPort,
  account: Pick<Account, "id" | "login">,
  repository: RepoRef,
) {
  const { owner, name } = repository;
  return infiniteQueryOptions<
    RepoPage,
    GitHubQueryError,
    InfiniteData<RepoPage, string | null>,
    readonly unknown[],
    string | null
  >({
    queryKey: [...repoPagesKey(account.id), `${owner}/${name}`.toLowerCase()],
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      const { data, partialErrors } = await unwrap(
        github.listRepoPullRequests(account.id, account.login, repository, pageParam),
      );
      return { ...data, partialErrors };
    },
    getNextPageParam: (last) => last.page.nextCursor,
    staleTime: REFRESH_INTERVAL_MS,
  });
}

/** One repository's header and its loaded open PRs, with "Load more". */
export function useRepoPage(account: Account, repository: RepoRef) {
  const query = useInfiniteQuery(repoPullRequestsQueryOptions(useGitHub(), account, repository));
  const pages = query.data?.pages ?? [];
  // A PR updated between two page loads moves up and could be on both: keep the first.
  const byId = new Map<string, PullRequest>();
  for (const pr of pages.flatMap((page) => page.page.pullRequests)) {
    if (!byId.has(pr.id)) byId.set(pr.id, pr);
  }
  return {
    repository: pages[0]?.repository ?? null,
    /** Every open PR, loaded or not. */
    openCount: pages[0]?.page.totalCount ?? null,
    pullRequests: [...byId.values()],
    isPending: query.isPending,
    error: query.error?.error ?? null,
    hasMore: query.hasNextPage,
    isLoadingMore: query.isFetchingNextPage,
    loadMore: (): void => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    },
  };
}

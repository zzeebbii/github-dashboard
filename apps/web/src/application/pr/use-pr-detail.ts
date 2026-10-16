import {
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import {
  CHECK_POLL_MS,
  hasPendingChecks,
  shouldRefetchChecks,
} from "../../domain/check-polling.ts";
import type { AccountId } from "../../domain/account.ts";
import type {
  CheckRun,
  PullRequestDetail,
  PullRequestRef,
  TimelinePage,
} from "../../domain/pr-detail.ts";
import type { GitHubError, GitHubReadPort, GitHubResult } from "../github.ts";
import { useGitHub } from "../github-provider.tsx";

/**
 * What opening a PR needs. `updatedAt` and `headSha` come from the list row the user
 * opened (T16/T20 rows carry both), so the cache can be checked without a request.
 */
export interface PrDetailInput {
  readonly accountId: AccountId;
  readonly ref: PullRequestRef;
  /** The PR's `updatedAt` as the list row has it. */
  readonly updatedAt: string;
  /** The head commit SHA as the list row has it. */
  readonly headSha: string;
}

/** A failed GitHub call as TanStack Query sees it. The message is the kind, never a token. */
export class GitHubQueryError extends Error {
  readonly error: GitHubError;
  constructor(error: GitHubError) {
    super(error.kind);
    this.name = "GitHubQueryError";
    this.error = error;
  }
}

async function unwrap<T>(
  call: Promise<GitHubResult<T>>,
): Promise<{ readonly data: T; readonly partialErrors: readonly GitHubError[] }> {
  const result = await call;
  if (!result.ok) throw new GitHubQueryError(result.error);
  return result.value;
}

/** One page of the conversation. Only the first carries the PR itself. */
interface DetailPage {
  readonly pullRequest: PullRequestDetail | null;
  readonly timeline: TimelinePage;
  readonly partialErrors: readonly GitHubError[];
}

const repoOf = (ref: PullRequestRef) => `${ref.owner}/${ref.name}`;

/**
 * FR-6.5: the key holds `updatedAt` + head SHA, so a changed PR is a new key and an
 * unchanged one is never stale. A cached, unchanged open makes 0 requests (AC-6.1), also
 * after a reload: `["prDetail", accountId, ...]` keys are persisted (query-hydration.ts).
 * Loaded "more" pages are part of the entry and are cached with it.
 *
 * ponytail: records of older `updatedAt`/SHA keys stay in IndexedDB until the account is
 * cleared; prune them when the store grows noticeably.
 */
export function prDetailQueryOptions(github: GitHubReadPort, input: PrDetailInput) {
  const { accountId, ref } = input;
  return infiniteQueryOptions<
    DetailPage,
    GitHubQueryError,
    { readonly pages: DetailPage[]; readonly pageParams: (string | null)[] },
    readonly unknown[],
    string | null
  >({
    queryKey: ["prDetail", accountId, repoOf(ref), ref.number, input.updatedAt, input.headSha],
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      if (pageParam === null) {
        const { data, partialErrors } = await unwrap(github.getPullRequest(accountId, ref));
        return { pullRequest: data.pullRequest, timeline: data.timeline, partialErrors };
      }
      const { data, partialErrors } = await unwrap(
        github.getTimelinePage(accountId, ref, pageParam),
      );
      return { pullRequest: null, timeline: data, partialErrors };
    },
    getNextPageParam: (last) => last.timeline.nextCursor,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/**
 * Check runs of the head SHA (FR-6.5, AC-6.2): while any is pending, refetched every 60 s
 * (and on open once the cached copy is 60 s old); once all are completed, never again for
 * that SHA. Polling pauses while the tab is hidden (TanStack's default).
 */
export function checkRunsQueryOptions(github: GitHubReadPort, input: PrDetailInput) {
  const { accountId, ref } = input;
  return queryOptions<readonly CheckRun[], GitHubQueryError>({
    queryKey: ["prDetail", accountId, repoOf(ref), ref.number, "checks", input.headSha],
    queryFn: async () => (await unwrap(github.getCheckRuns(accountId, ref, input.headSha))).data,
    staleTime: (query) => {
      const runs = query.state.data;
      if (runs === undefined) return 0;
      const stale = shouldRefetchChecks(runs, new Date(query.state.dataUpdatedAt), new Date());
      return stale ? 0 : Number.POSITIVE_INFINITY;
    },
    refetchInterval: (query) => {
      const runs = query.state.data;
      return runs !== undefined && hasPendingChecks(runs) ? CHECK_POLL_MS : false;
    },
  });
}

/** The detail panel's data: the PR, its conversation with "Load more", and its checks. */
export function usePrDetail(input: PrDetailInput) {
  const github = useGitHub();
  const detail = useInfiniteQuery(prDetailQueryOptions(github, input));
  const checks = useQuery(checkRunsQueryOptions(github, input));
  const pages = detail.data?.pages ?? [];
  return {
    detail,
    checks,
    pullRequest: pages[0]?.pullRequest ?? null,
    timeline: pages.flatMap((page) => page.timeline.items),
    partialErrors: pages.flatMap((page) => page.partialErrors),
    hasMore: detail.hasNextPage,
    loadMore: (): void => {
      if (detail.hasNextPage && !detail.isFetchingNextPage) void detail.fetchNextPage();
    },
  };
}

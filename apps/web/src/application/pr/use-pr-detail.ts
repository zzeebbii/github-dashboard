import {
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { OWN_REFRESH_ONLY } from "../refresh-scheduler.ts";
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

/** A port result as a query function wants it: the value, or a thrown `GitHubQueryError`. */
export async function unwrap<T>(
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

/** What the detail cache key needs from a list row (FR-6.5). */
export type PrHead = Pick<PrDetailInput, "updatedAt" | "headSha">;

/**
 * The cache key's `updatedAt` and head SHA for a panel opened without a list row (a deep
 * link, or a PR outside the loaded list). The row's values win whenever there is one.
 *
 * Without a row there is nothing to check the cache against, so this asks GitHub for the
 * detail itself (1 GraphQL request), keys it by the response and stores it as that key's
 * first page: the detail query then finds it cached. With the checks request, an uncached
 * deep link stays at 2 GraphQL requests, 0 REST (AC-3.1, AC-6.1). No extra "head" query.
 */
export function usePrHead(
  accountId: AccountId,
  ref: PullRequestRef,
  row: PrHead | null,
): { readonly head: PrHead | null; readonly error: GitHubQueryError | null } {
  const github = useGitHub();
  const client = useQueryClient();
  const resolved = useQuery<PrHead, GitHubQueryError>({
    queryKey: ["prHead", accountId, repoOf(ref), ref.number],
    enabled: row === null,
    // The panel follows the list rows; this lookup is only remade when the panel reopens.
    meta: OWN_REFRESH_ONLY,
    queryFn: async () => {
      const { data, partialErrors } = await unwrap(github.getPullRequest(accountId, ref));
      const { pullRequest, timeline } = data;
      const head = { updatedAt: pullRequest.updatedAt, headSha: pullRequest.headSha };
      // A real fetch (not setQueryData), so query-hydration.ts persists it. Already cached
      // under that key (with any loaded "more" pages): left as it is.
      await client.prefetchInfiniteQuery({
        ...prDetailQueryOptions(github, { accountId, ref, ...head }),
        queryFn: () => ({ pullRequest, timeline, partialErrors }),
      });
      return head;
    },
  });
  return { head: row ?? resolved.data ?? null, error: row === null ? resolved.error : null };
}

/**
 * The detail panel's data: the PR, its conversation with "Load more", and its checks.
 * `enabled: false` while the key is not known yet (usePrHead), so the panel can call it
 * from the start and keep one component tree (its focused heading) while it loads.
 */
export function usePrDetail(input: PrDetailInput, { enabled = true } = {}) {
  const github = useGitHub();
  const detail = useInfiniteQuery({ ...prDetailQueryOptions(github, input), enabled });
  const checks = useQuery({ ...checkRunsQueryOptions(github, input), enabled });
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

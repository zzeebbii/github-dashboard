import { type QueryClient, queryOptions, useQueries, useQuery } from "@tanstack/react-query";
import type { Account, AccountId } from "../../domain/account.ts";
import { hasActivitySince, newActivityCount } from "../../domain/activity.ts";
import type { ActivityItem, PullRequest } from "../../domain/pull-request.ts";
import { placePullRequest, type Placement, type Section } from "../../domain/sections.ts";
import {
  type GitHubError,
  type GitHubReadPort,
  HOME_SEARCHES,
  type HomeSearch,
  type PullRequestPage,
} from "../github.ts";
import { useGitHub } from "../github-provider.tsx";
import { type GitHubQueryError, unwrap } from "../pr/use-pr-detail.ts";
import { OWN_REFRESH_ONLY } from "../refresh-scheduler.ts";
import { useSeen } from "../seen.ts";

/** GitHub search returns at most 1,000 results (AC-5.7). */
const SEARCH_RESULT_CAP = 1000;
/** "+N new" asks about at most this many PRs per request (github-query-costs.md). */
const ACTIVITY_BATCH = 10;
/** Who the viewer is changes rarely: teams are read once a day, like the repository list. */
const VIEWER_STALE_MS = 24 * 60 * 60 * 1000;

/**
 * Query keys of Home, in one place. `[store, accountId, ...]`, so the searches are persisted
 * in `prLists`, restored on reload, and refreshed on the T14 schedule (one request per page,
 * so 3 per refresh while each search has ≤ 20 PRs: AC-3.1). The viewer and the "+N new"
 * counts opt out of the schedule: the viewer is kept a day, and a count's key holds the PR's
 * `updatedAt` and marker, so it can only change when those do.
 */
const homeKeys = {
  searches: (accountId: AccountId) => ["prLists", accountId, "home"] as const,
  search: (accountId: AccountId, search: HomeSearch) =>
    [...homeKeys.searches(accountId), search] as const,
  activity: (accountId: AccountId, batch: readonly ActivityKey[]) =>
    ["prLists", accountId, "homeActivity", batch] as const,
  viewer: (accountId: AccountId) => ["repos", accountId, "viewer"] as const,
};

/** One search, every page of it. */
interface SearchResult {
  readonly pullRequests: readonly PullRequest[];
  /** More matched than GitHub would return (FR-5.5). */
  readonly truncated: boolean;
  readonly partialErrors: readonly GitHubError[];
}

/**
 * Pages through one search, 20 at a time, until it is exhausted or the 1,000-result cap is
 * reached (AC-5.7). One request per page, one after another.
 */
export function homeSearchQueryOptions(
  github: GitHubReadPort,
  account: Pick<Account, "id" | "login">,
  search: HomeSearch,
) {
  return queryOptions<SearchResult, GitHubQueryError>({
    queryKey: homeKeys.search(account.id, search),
    queryFn: async () => {
      const pullRequests: PullRequest[] = [];
      const partialErrors: GitHubError[] = [];
      let after: string | null = null;
      let totalCount = 0;
      do {
        // oxlint-disable-next-line no-await-in-loop -- reason: each page needs the previous page's cursor
        const page: { data: PullRequestPage; partialErrors: readonly GitHubError[] } = await unwrap(
          github.searchHome(account.id, account.login, search, after),
        );
        pullRequests.push(...page.data.pullRequests);
        partialErrors.push(...page.partialErrors);
        ({ totalCount } = page.data);
        after = page.data.nextCursor;
      } while (after !== null && pullRequests.length < SEARCH_RESULT_CAP);
      const truncated =
        pullRequests.length >= SEARCH_RESULT_CAP && totalCount > pullRequests.length;
      return { pullRequests, truncated, partialErrors };
    },
  });
}

/** Every cached Home PR, duplicates included; never a request (the command palette, AC-7.1). */
export const cachedHomePullRequests = (client: QueryClient, accountId: AccountId) =>
  client
    .getQueriesData<SearchResult>({ queryKey: homeKeys.searches(accountId) })
    .flatMap(([, data]) => data?.pullRequests ?? []);

/** The viewer's teams (`org/slug`), for "Team: @x" requests (FR-5.1). */
function viewerQueryOptions(github: GitHubReadPort, account: Account) {
  return queryOptions<readonly string[], GitHubQueryError>({
    queryKey: homeKeys.viewer(account.id),
    queryFn: async () => {
      const { data } = await unwrap(github.viewer(account));
      return data.organizations.flatMap((org) => org.teams.map((slug) => `${org.login}/${slug}`));
    },
    staleTime: VIEWER_STALE_MS,
    meta: OWN_REFRESH_ONLY,
  });
}

/** What a "+N new" count depends on: the PR, its version and its marker. */
type ActivityKey = readonly [
  id: string,
  repository: string,
  number: number,
  updatedAt: string,
  since: string,
];

const chunks = <T>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );

/**
 * The lazy "+N new" queries (FR-5.3, AC-3.1): one per 10 PRs whose last comment or review
 * is newer than their seen marker; none when nothing is newer, or no marker exists. Each
 * key holds the PR's `updatedAt` and marker, so an unchanged PR is never asked about again.
 */
export function homeActivityQueryOptions(
  github: GitHubReadPort,
  accountId: AccountId,
  prs: readonly PullRequest[],
  seen: Readonly<Record<string, string>> | null,
) {
  const batch = prs
    .flatMap((pr): ActivityKey[] => {
      const since = seen?.[pr.id] ?? null;
      return since !== null && hasActivitySince(pr, since)
        ? [[pr.id, pr.repository, pr.number, pr.updatedAt, since]]
        : [];
    })
    .toSorted(([a], [b]) => a.localeCompare(b));
  return chunks(batch, ACTIVITY_BATCH).map((keys) =>
    queryOptions<Readonly<Record<string, readonly ActivityItem[]>>, GitHubQueryError>({
      queryKey: homeKeys.activity(accountId, keys),
      queryFn: async () => {
        const requests = keys.map(([, repository, number, , since]) => ({
          repository,
          number,
          since,
        }));
        const { data } = await unwrap(github.getActivitySince(accountId, requests));
        return Object.fromEntries(keys.flatMap(([id], i) => (data[i] ? [[id, data[i]]] : [])));
      },
      staleTime: Number.POSITIVE_INFINITY,
      meta: OWN_REFRESH_ONLY,
    }),
  );
}

/**
 * Merges the searches by node id (FR-5.4). The same PR from two searches is the same data,
 * except that only the "reviewed by me" row carries the re-review fields: keep them.
 */
function mergeById(lists: readonly (readonly PullRequest[])[]): PullRequest[] {
  const byId = new Map<string, PullRequest>();
  for (const pr of lists.flat()) {
    const seen = byId.get(pr.id);
    byId.set(
      pr.id,
      seen === undefined
        ? pr
        : {
            ...seen,
            headCommittedAt: seen.headCommittedAt ?? pr.headCommittedAt,
            viewerReviewRequestedAt: seen.viewerReviewRequestedAt ?? pr.viewerReviewRequestedAt,
            activity: seen.activity.length >= pr.activity.length ? seen.activity : pr.activity,
          },
    );
  }
  return [...byId.values()];
}

/**
 * "+N new" for a list's rows (FR-5.3), and `markSeen` for opening one (FR-5.8). Home and the
 * repository page share it. Exact counts are fetched only for PRs whose last comment or
 * review is newer than their marker, ten per request (AC-3.1); none when nothing is newer.
 */
export function useNewCounts(account: Pick<Account, "id" | "login">, prs: readonly PullRequest[]) {
  const github = useGitHub();
  const { seen, markSeen } = useSeen(account.id);
  const counted = useQueries({
    queries: homeActivityQueryOptions(github, account.id, prs, seen),
  });
  const activity: Record<string, readonly ActivityItem[]> = {};
  for (const batch of counted) Object.assign(activity, batch.data);

  /** null hides it: no marker yet, or the exact count is still loading. */
  function newCount(pr: PullRequest): number | null {
    const marker = seen?.[pr.id] ?? null;
    if (!hasActivitySince(pr, marker)) return newActivityCount(pr, account.login, marker);
    const items = activity[pr.id];
    return items === undefined
      ? null
      : newActivityCount({ ...pr, activity: items }, account.login, marker);
  }

  return { newCount, markSeen };
}

export interface HomeRow {
  readonly pr: PullRequest;
  readonly reason: Placement["reason"];
  /** "+N new": null hides it (no marker yet, or the count is still loading). */
  readonly newCount: number | null;
}

/**
 * Home (FR-5.1–5.5): the three searches merged, placed by T18's rule table, with "+N new"
 * from the seen markers. A PR no rule places (e.g. reviewed by you, nothing new) is not
 * shown. Exact counts are fetched only for PRs whose last comment or review is newer than
 * their marker, ten per request (AC-3.1); none when nothing is newer.
 */
export function useHome(account: Account) {
  const github = useGitHub();
  const viewer = useQuery(viewerQueryOptions(github, account));
  const searches = useQueries({
    queries: HOME_SEARCHES.map((search) => homeSearchQueryOptions(github, account, search)),
  });
  const placed = mergeById(searches.map((s) => s.data?.pullRequests ?? [])).flatMap((pr) => {
    const placement = placePullRequest(pr, { login: account.login, teams: viewer.data ?? [] });
    return placement === null ? [] : [{ pr, placement }];
  });
  const { newCount, markSeen } = useNewCounts(
    account,
    placed.map(({ pr }) => pr),
  );

  const sections: Record<Section, HomeRow[]> = {
    "needs-review": [],
    "needs-action": [],
    waiting: [],
  };
  for (const { pr, placement } of placed) {
    sections[placement.section].push({ pr, reason: placement.reason, newCount: newCount(pr) });
  }

  const failed = [viewer, ...searches].find((q) => q.error !== null)?.error ?? null;
  return {
    sections,
    /** Loading until the viewer's teams and every search have answered once. */
    isPending: viewer.isPending || searches.some((s) => s.isPending),
    error: failed?.error ?? null,
    truncated: searches.some((s) => s.data?.truncated === true),
    partialErrors: searches.flatMap((s) => s.data?.partialErrors ?? []),
    markSeen,
  };
}

import { isBot, type PullRequest, sameLogin, toMillis } from "./pull-request.ts";

const STALE_AFTER_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * "+N new": comments, reviews and replies by other humans newer than the seen
 * marker. null when there is no marker, so the count is hidden.
 */
export function newActivityCount(
  pr: PullRequest,
  viewerLogin: string,
  seenAt: string | null,
): number | null {
  if (seenAt === null) return null;
  const seen = toMillis(seenAt);
  return pr.activity.filter(
    (item) =>
      item.kind !== "commit" &&
      !isBot(item.author) &&
      !(item.author !== null && sameLogin(item.author.login, viewerLogin)) &&
      toMillis(item.createdAt) > seen,
  ).length;
}

/**
 * What a refresh brought, for "Updated, 3 new" (FR-7.4): the PRs in `after` that were in
 * no list before it, plus those with a comment or review by another human since the
 * version `before` held (the "+N new" rule, counted from that version's `updatedAt`).
 * A PR moving between lists or sections is not new. With nothing before to compare
 * against (a first load), nothing is new.
 */
export function newSinceRefresh(
  before: readonly PullRequest[],
  after: readonly PullRequest[],
  viewerLogin: string,
): number {
  if (before.length === 0) return 0;
  const previous = new Map(before.map((pr) => [pr.id, pr]));
  const fresh = new Set<string>();
  for (const pr of after) {
    const old = previous.get(pr.id);
    if (old === undefined || (newActivityCount(pr, viewerLogin, old.updatedAt) ?? 0) > 0) {
      fresh.add(pr.id);
    }
  }
  return fresh.size;
}

/**
 * Whether "+N new" needs the exact count: a marker exists and the PR's known activity has
 * something newer than it. A list row knows only its last comment or review, so false here
 * means the count is 0 without asking GitHub (docs/architecture/github-query-costs.md).
 */
export function hasActivitySince(pr: PullRequest, seenAt: string | null): boolean {
  if (seenAt === null) return false;
  const seen = toMillis(seenAt);
  return pr.activity.some((item) => item.kind !== "commit" && toMillis(item.createdAt) > seen);
}

/**
 * Stale: no human comment, review or commit for 14 days or more. Bot activity is
 * ignored; the PR's creation counts as the starting point.
 */
export function isStale(pr: PullRequest, now: Date): boolean {
  const human = pr.activity.filter((item) => !isBot(item.author)).map((i) => toMillis(i.createdAt));
  const lastHuman = Math.max(toMillis(pr.createdAt), ...human);
  return now.getTime() - lastHuman >= STALE_AFTER_DAYS * DAY_MS;
}

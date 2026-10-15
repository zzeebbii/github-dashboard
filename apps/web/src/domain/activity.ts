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
 * Stale: no human comment, review or commit for 14 days or more. Bot activity is
 * ignored; the PR's creation counts as the starting point.
 */
export function isStale(pr: PullRequest, now: Date): boolean {
  const human = pr.activity.filter((item) => !isBot(item.author)).map((i) => toMillis(i.createdAt));
  const lastHuman = Math.max(toMillis(pr.createdAt), ...human);
  return now.getTime() - lastHuman >= STALE_AFTER_DAYS * DAY_MS;
}

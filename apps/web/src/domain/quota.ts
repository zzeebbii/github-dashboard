/**
 * The quota guard (FR-3.8, ADR-0017), as the design's `quotaNote` words it: "Auto-refresh
 * slows down below 20% and pauses below 5% until the reset." Pure: time is passed in.
 */

export const REFRESH_INTERVAL_MS = 5 * 60_000;
/** On focus, refresh when the last refresh is older than this (FR-3.7). */
export const FOCUS_REFRESH_AFTER_MS = 60_000;

const SLOW_BELOW = 0.2;
const PAUSE_BELOW = 0.05;

/** What is known about one rate-limit pool. */
export interface PoolQuota {
  readonly limit: number;
  readonly remaining: number;
  readonly resetAt: Date;
}

export type QuotaLevel = "ok" | "low" | "critical";

const ratio = ({ limit, remaining }: PoolQuota) => (limit > 0 ? remaining / limit : 0);

/** The design's colours: green, amber below 20%, red below 5%. */
export function quotaLevel(quota: PoolQuota): QuotaLevel {
  const left = ratio(quota);
  return left < PAUSE_BELOW ? "critical" : left < SLOW_BELOW ? "low" : "ok";
}

export type RefreshDelay =
  | { readonly kind: "every"; readonly ms: number }
  | { readonly kind: "pausedUntil"; readonly until: Date };

/**
 * How often to refresh automatically, given the GraphQL pool. Unknown quota (nothing
 * spent yet, or the window has reset) refreshes at the base rate.
 */
export function nextRefreshDelay(graphql: PoolQuota | undefined, baseMs: number): RefreshDelay {
  const level = graphql === undefined ? "ok" : quotaLevel(graphql);
  if (graphql !== undefined && level === "critical") {
    return { kind: "pausedUntil", until: graphql.resetAt };
  }
  return { kind: "every", ms: level === "low" ? baseMs * 2 : baseMs };
}

import type { AccountId } from "../domain/account.ts";
import type { PoolQuota } from "../domain/quota.ts";

/**
 * The read side of the GitHub adapter's rate-limit tracker (FR-3.4, FR-3.8). The tracker
 * in infrastructure/github/rate-limit.ts implements it; the refresh scheduler reads it.
 */

export const RATE_LIMIT_POOLS = ["graphql", "core", "search"] as const;
export type RateLimitPool = (typeof RATE_LIMIT_POOLS)[number];

export interface RateLimitState extends PoolQuota {
  /** Points the last GraphQL query cost; REST requests do not report one. */
  readonly lastCost: number | null;
  /** When the response that said so arrived: in this tab, another one, or before a reload. */
  readonly observedAt: Date;
}

/** What is known per pool for one account. A pool not used yet is absent. */
export type QuotaSnapshot = Partial<Record<RateLimitPool, RateLimitState>>;

export interface RateLimitReader {
  /** undefined when nothing is known, or the window has reset since it was observed. */
  get(accountId: AccountId, pool: RateLimitPool): RateLimitState | undefined;
  /** Until when a secondary limit pauses every request of this account; undefined if not. */
  pausedUntil(accountId: AccountId): Date | undefined;
  /** Called after every response that carried an account's quota. Returns an unsubscribe. */
  subscribe(listener: (accountId: AccountId) => void): () => void;
}

/** Per pool, the more recently observed of the two. */
export function latestQuota(known: QuotaSnapshot, incoming: QuotaSnapshot): QuotaSnapshot {
  const merged: Partial<Record<RateLimitPool, RateLimitState>> = { ...known };
  for (const pool of RATE_LIMIT_POOLS) {
    const next = incoming[pool];
    const current = merged[pool];
    if (next !== undefined && (current === undefined || next.observedAt >= current.observedAt)) {
      merged[pool] = next;
    }
  }
  return merged;
}

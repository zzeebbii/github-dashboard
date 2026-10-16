import {
  RATE_LIMIT_POOLS,
  type RateLimitPool,
  type RateLimitReader,
  type RateLimitState,
} from "../../application/rate-limits.ts";
import type { AccountId } from "../../domain/account.ts";

/**
 * Rate-limit state per account and pool (FR-3.4), fed from every response's
 * `x-ratelimit-*` headers and from the `rateLimit` field each GraphQL document selects.
 * Also remembers a secondary limit's `retry-after` (FR-3.8). The refresh scheduler reads it
 * through the `RateLimitReader` port.
 */

/** The selection every GraphQL document makes: `rateLimit { cost limit remaining resetAt }`. */
interface GraphQLRateLimit {
  readonly cost: number;
  readonly limit: number;
  readonly remaining: number;
  readonly resetAt: string;
}

export interface RateLimitTracker extends RateLimitReader {
  fromHeaders(accountId: AccountId, headers: Headers): void;
  fromGraphQL(accountId: AccountId, rateLimit: GraphQLRateLimit): void;
  secondaryLimit(accountId: AccountId, retryAt: Date): void;
}

const POOLS: readonly string[] = RATE_LIMIT_POOLS;
const isPool = (value: string | null): value is RateLimitPool =>
  value !== null && POOLS.includes(value);

/** A non-negative integer header, or null. */
function intHeader(headers: Headers, name: string): number | null {
  const text = headers.get(name);
  return text !== null && /^\d+$/.test(text) ? Number(text) : null;
}

const keyOf = (accountId: AccountId, pool: RateLimitPool) => `${accountId}:${pool}`;

export function createRateLimitTracker(clock: { now(): Date }): RateLimitTracker {
  const states = new Map<string, RateLimitState>();
  const retryAt = new Map<AccountId, Date>();

  return {
    fromHeaders(accountId, headers) {
      const pool = headers.get("x-ratelimit-resource");
      const limit = intHeader(headers, "x-ratelimit-limit");
      const remaining = intHeader(headers, "x-ratelimit-remaining");
      const reset = intHeader(headers, "x-ratelimit-reset");
      // Other pools (code_search, integration_manifest, …) are not ones the app spends.
      if (!isPool(pool) || limit === null || remaining === null || reset === null) return;
      const previous = states.get(keyOf(accountId, pool));
      states.set(keyOf(accountId, pool), {
        limit,
        remaining,
        resetAt: new Date(reset * 1000),
        lastCost: previous?.lastCost ?? null,
      });
    },

    fromGraphQL(accountId, { cost, limit, remaining, resetAt }) {
      const reset = new Date(resetAt);
      if (Number.isNaN(reset.getTime())) return;
      states.set(keyOf(accountId, "graphql"), { limit, remaining, resetAt: reset, lastCost: cost });
    },

    get(accountId, pool) {
      const state = states.get(keyOf(accountId, pool));
      return state !== undefined && state.resetAt > clock.now() ? state : undefined;
    },

    secondaryLimit(accountId, at) {
      retryAt.set(accountId, at);
    },

    pausedUntil(accountId) {
      const at = retryAt.get(accountId);
      return at !== undefined && at > clock.now() ? at : undefined;
    },
  };
}

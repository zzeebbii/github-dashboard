import type { AccountId } from "../../domain/account.ts";

/**
 * Rate-limit state per account and pool (FR-3.4), fed from every response's
 * `x-ratelimit-*` headers and from the `rateLimit` field each GraphQL document selects.
 * T14's quota guard reads it through `get`.
 */

type RateLimitPool = "core" | "graphql" | "search";

interface RateLimitState {
  readonly limit: number;
  readonly remaining: number;
  readonly resetAt: Date;
  /** Points the last GraphQL query cost; REST requests do not report one. */
  readonly lastCost: number | null;
}

/** The selection every GraphQL document makes: `rateLimit { cost limit remaining resetAt }`. */
interface GraphQLRateLimit {
  readonly cost: number;
  readonly limit: number;
  readonly remaining: number;
  readonly resetAt: string;
}

export interface RateLimitTracker {
  fromHeaders(accountId: AccountId, headers: Headers): void;
  fromGraphQL(accountId: AccountId, rateLimit: GraphQLRateLimit): void;
  /** undefined when nothing is known, or the window has reset since it was observed. */
  get(accountId: AccountId, pool: RateLimitPool): RateLimitState | undefined;
}

const POOLS: readonly string[] = ["core", "graphql", "search"] satisfies RateLimitPool[];
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
  };
}

import { z } from "zod";
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
 * through the `RateLimitReader` port, and hears of every change through `subscribe`.
 *
 * The last known state is kept in this tab's sessionStorage, so a reload that serves
 * everything from the cache still knows it. Only numbers are stored, never a token; a
 * window that has reset is forgotten on read, like in memory.
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
const storageKey = (accountId: AccountId) => `ghd:quota:${accountId}`;

/** Stored data is validated on read: another build, or anyone, may have written it. */
const StoredSchema = z.partialRecord(
  z.enum(RATE_LIMIT_POOLS),
  z.object({
    limit: z.number(),
    remaining: z.number(),
    resetAt: z.number(),
    lastCost: z.number().nullable(),
    observedAt: z.number(),
  }),
);

/** `storage` null keeps it in memory only (tests). */
export function createRateLimitTracker(
  clock: { now(): Date },
  storage: Storage | null = sessionStorage,
): RateLimitTracker {
  const states = new Map<string, RateLimitState>();
  const retryAt = new Map<AccountId, Date>();
  const restored = new Set<AccountId>();
  const listeners = new Set<(accountId: AccountId) => void>();

  /** Reads an account's stored state once, before its first use; never overwrites newer. */
  function restore(accountId: AccountId) {
    if (storage === null || restored.has(accountId)) return;
    restored.add(accountId);
    let raw: unknown = null;
    try {
      raw = JSON.parse(storage.getItem(storageKey(accountId)) ?? "null");
    } catch {
      return;
    }
    const parsed = StoredSchema.safeParse(raw);
    if (!parsed.success) return;
    for (const pool of RATE_LIMIT_POOLS) {
      const stored = parsed.data[pool];
      if (stored === undefined || states.has(keyOf(accountId, pool))) continue;
      states.set(keyOf(accountId, pool), {
        limit: stored.limit,
        remaining: stored.remaining,
        resetAt: new Date(stored.resetAt),
        lastCost: stored.lastCost,
        observedAt: new Date(stored.observedAt),
      });
    }
  }

  function record(accountId: AccountId, pool: RateLimitPool, state: RateLimitState) {
    states.set(keyOf(accountId, pool), state);
    if (storage !== null) {
      const stored = Object.fromEntries(
        RATE_LIMIT_POOLS.flatMap((each) => {
          const known = states.get(keyOf(accountId, each));
          return known === undefined
            ? []
            : [
                [
                  each,
                  {
                    ...known,
                    resetAt: known.resetAt.getTime(),
                    observedAt: known.observedAt.getTime(),
                  },
                ],
              ];
        }),
      );
      try {
        storage.setItem(storageKey(accountId), JSON.stringify(stored));
      } catch {
        // Full or blocked storage: the quota is simply not remembered across a reload.
      }
    }
    for (const listener of listeners) listener(accountId);
  }

  return {
    fromHeaders(accountId, headers) {
      const pool = headers.get("x-ratelimit-resource");
      const limit = intHeader(headers, "x-ratelimit-limit");
      const remaining = intHeader(headers, "x-ratelimit-remaining");
      const reset = intHeader(headers, "x-ratelimit-reset");
      // Other pools (code_search, integration_manifest, …) are not ones the app spends.
      if (!isPool(pool) || limit === null || remaining === null || reset === null) return;
      restore(accountId);
      const previous = states.get(keyOf(accountId, pool));
      record(accountId, pool, {
        limit,
        remaining,
        resetAt: new Date(reset * 1000),
        lastCost: previous?.lastCost ?? null,
        observedAt: clock.now(),
      });
    },

    fromGraphQL(accountId, { cost, limit, remaining, resetAt }) {
      const reset = new Date(resetAt);
      if (Number.isNaN(reset.getTime())) return;
      restore(accountId);
      record(accountId, "graphql", {
        limit,
        remaining,
        resetAt: reset,
        lastCost: cost,
        observedAt: clock.now(),
      });
    },

    get(accountId, pool) {
      restore(accountId);
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

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

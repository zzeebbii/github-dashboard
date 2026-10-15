/**
 * The persistent cache port (ADR-0017). The IndexedDB adapter lives in
 * infrastructure/cache; tests use tests/fakes/in-memory-cache.ts.
 *
 * Every record is namespaced by account id. Never put a token in here.
 */

// ponytail: plain string until the branded AccountId (domain/account.ts) lands; tighten then.
export type CacheAccountId = string;

export const CACHE_STORES = ["repos", "prLists", "prDetail", "seen", "requests"] as const;
export type CacheStore = (typeof CACHE_STORES)[number];

export interface CacheEntry {
  readonly accountId: CacheAccountId;
  readonly key: string;
  readonly fetchedAt: Date;
  readonly etag?: string;
  readonly data: unknown;
}

export interface CachePort {
  /** A miss (`undefined`) for absent, outdated or unreadable records; never throws. */
  get(accountId: CacheAccountId, store: CacheStore, key: string): Promise<CacheEntry | undefined>;
  /** Stamps `fetchedAt` from the adapter's clock. */
  put(
    accountId: CacheAccountId,
    store: CacheStore,
    key: string,
    value: { readonly data: unknown; readonly etag?: string },
  ): Promise<void>;
  delete(accountId: CacheAccountId, store: CacheStore, key: string): Promise<void>;
  /** Every readable record in a store, across accounts. Used by query hydration. */
  getAll(store: CacheStore): Promise<readonly CacheEntry[]>;
  clearAccount(accountId: CacheAccountId): Promise<void>;
  clearAll(): Promise<void>;
}

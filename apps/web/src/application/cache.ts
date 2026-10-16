import type { AccountId } from "../domain/account.ts";

/**
 * The persistent cache port (ADR-0017). The IndexedDB adapter lives in
 * infrastructure/cache; tests use tests/fakes/in-memory-cache.ts.
 *
 * Every record is namespaced by account id, and no call works without one (FR-2.12):
 * there is no cross-account read. Never put a token in here.
 */

export const CACHE_STORES = ["repos", "prLists", "prDetail", "seen", "requests"] as const;
export type CacheStore = (typeof CACHE_STORES)[number];

export interface CacheEntry {
  readonly accountId: AccountId;
  readonly key: string;
  readonly fetchedAt: Date;
  readonly etag?: string;
  readonly data: unknown;
}

export interface CachePort {
  /** A miss (`undefined`) for absent, outdated or unreadable records; never throws. */
  get(accountId: AccountId, store: CacheStore, key: string): Promise<CacheEntry | undefined>;
  /** Stamps `fetchedAt` from the adapter's clock. */
  put(
    accountId: AccountId,
    store: CacheStore,
    key: string,
    value: { readonly data: unknown; readonly etag?: string },
  ): Promise<void>;
  delete(accountId: AccountId, store: CacheStore, key: string): Promise<void>;
  /** Every readable record of this account in a store. Used by query hydration. */
  getAll(accountId: AccountId, store: CacheStore): Promise<readonly CacheEntry[]>;
  clearAccount(accountId: AccountId): Promise<void>;
  /** Sign out of everything: the whole database is deleted, not just emptied (FR-2.9). */
  clearAll(): Promise<void>;
}

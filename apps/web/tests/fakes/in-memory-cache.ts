import type { CachePort, CacheStore, CacheEntry } from "../../src/application/cache.ts";
import type { AccountId } from "../../src/domain/account.ts";

type Entry = CacheEntry & { readonly store: CacheStore };

const id = (accountId: AccountId, store: CacheStore, key: string) =>
  JSON.stringify([store, accountId, key]);

/** An in-memory CachePort for component tests. Same contract as the IndexedDB adapter. */
export function inMemoryCache(clock: { now(): Date }): CachePort & {
  readonly entries: Map<string, Entry>;
} {
  const entries = new Map<string, Entry>();
  const done = Promise.resolve();

  return {
    entries,
    get: (accountId, store, key) => Promise.resolve(entries.get(id(accountId, store, key))),
    put: (accountId, store, key, value) => {
      entries.set(id(accountId, store, key), {
        accountId,
        store,
        key,
        fetchedAt: clock.now(),
        ...value,
      });
      return done;
    },
    delete: (accountId, store, key) => {
      entries.delete(id(accountId, store, key));
      return done;
    },
    getAll: (accountId, store) =>
      Promise.resolve(
        [...entries.values()].filter((e) => e.store === store && e.accountId === accountId),
      ),
    clearAccount: (accountId) => {
      for (const [k, e] of entries) if (e.accountId === accountId) entries.delete(k);
      return done;
    },
    clearAll: () => {
      entries.clear();
      return done;
    },
  };
}

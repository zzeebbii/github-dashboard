import type { QueryClient } from "@tanstack/react-query";
import { type AccountId, toAccountId } from "../domain/account.ts";
import type { CachePort, CacheStore } from "./cache.ts";

/**
 * Cache-first TanStack Query (ADR-0017, FR-3.6).
 *
 * Convention: a query is persisted when its key is `[store, accountId, ...parts]`, with
 * `store` one of QUERY_STORES and `parts` JSON-serialisable. The cache key is
 * `JSON.stringify(parts)`, so every record carries the account id.
 */

const QUERY_STORES = ["repos", "prLists", "prDetail"] as const satisfies readonly CacheStore[];
type QueryStore = (typeof QUERY_STORES)[number];

const isQueryStore = (value: unknown): value is QueryStore => QUERY_STORES.some((s) => s === value);
const isList = (value: unknown): value is readonly unknown[] => Array.isArray(value);

function toCacheAddress(
  queryKey: unknown,
): { store: QueryStore; accountId: AccountId; key: string } | undefined {
  if (!isList(queryKey)) return undefined;
  const [store, rawAccountId, ...parts] = queryKey;
  const accountId = typeof rawAccountId === "string" ? toAccountId(rawAccountId) : null;
  if (!isQueryStore(store) || accountId === null) return undefined;
  return { store, accountId, key: JSON.stringify(parts) };
}

/**
 * Restores the cached query data of ONE account, the active one (FR-2.12): another
 * account's records never reach the query client. Call it again after switching account.
 *
 * Gives up after `timeoutMs` so a slow database never blocks first paint. Restored data
 * keeps its original `fetchedAt`, so it is stale and refetches in the background. A late
 * restore never overwrites newer data.
 */
export async function hydrateQueries(
  client: QueryClient,
  cache: CachePort,
  accountId: AccountId | null,
  { timeoutMs }: { readonly timeoutMs: number },
): Promise<void> {
  if (accountId === null) return;
  const restore = Promise.all(
    QUERY_STORES.map(async (store) => {
      for (const entry of await cache.getAll(accountId, store)) {
        let parts: unknown;
        try {
          parts = JSON.parse(entry.key);
        } catch {
          continue;
        }
        if (!isList(parts)) continue;
        const queryKey: unknown[] = [store, accountId, ...parts];
        const updatedAt = entry.fetchedAt.getTime();
        if ((client.getQueryState(queryKey)?.dataUpdatedAt ?? 0) >= updatedAt) continue;
        client.setQueryData(queryKey, entry.data, { updatedAt });
      }
    }),
    // A failed restore means "uncached", never a broken app.
  ).then(
    () => undefined,
    () => undefined,
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  try {
    await Promise.race([restore, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Write-through: every successful fetch of a persisted query is saved. Returns an unsubscribe. */
export function persistQueries(client: QueryClient, cache: CachePort): () => void {
  return client.getQueryCache().subscribe((event) => {
    // `manual` is setQueryData (including hydration itself); only real fetches are saved.
    if (event.type !== "updated" || event.action.type !== "success" || event.action.manual) {
      return;
    }
    const queryKey: unknown = event.query.queryKey;
    const data: unknown = event.query.state.data;
    const address = toCacheAddress(queryKey);
    if (address === undefined) return;
    cache.put(address.accountId, address.store, address.key, { data }).catch(() => undefined);
  });
}

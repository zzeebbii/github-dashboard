// `.tsx` only so this runs in the Chromium "component" project against real IndexedDB.
import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, test } from "vitest";
import { createInMemoryAccountStore } from "../../../tests/fakes/in-memory-account-store.ts";
import { CACHE_STORES, type CacheStore } from "../../application/cache.ts";
import { hydrateQueries } from "../../application/query-hydration.ts";
import { purgeSessionOnlyCaches } from "../../application/startup.ts";
import { type Account, toAccountId } from "../../domain/account.ts";
import { createIndexedDbCache } from "./indexeddb-cache.ts";

const clock = { now: () => new Date("2026-03-04T05:06:07.000Z") };
const account = (id: number, rememberMe: boolean): Account => ({
  id: toAccountId(id)!,
  login: `octo-${id}`,
  avatarUrl: "",
  tokenType: "fine-grained",
  scopes: [],
  rememberMe,
});
// 1 is a prefix of 10: the key-range bound must keep them apart.
const A = account(1, false);
const B = account(10, true);
const name = `ghd-isolation-${Date.now()}`;

afterEach(async () => {
  await createIndexedDbCache({ clock, name }).clearAll();
});

async function seeded() {
  const cache = createIndexedDbCache({ clock, name });
  await Promise.all(
    CACHE_STORES.flatMap((store) => [
      cache.put(A.id, store, '["k"]', { data: `A:${store}` }),
      cache.put(B.id, store, '["k"]', { data: `B:${store}` }),
    ]),
  );
  return cache;
}

const eachStore = <T,>(read: (store: CacheStore) => Promise<T>) =>
  Promise.all(CACHE_STORES.map(read));

test("with A and B cached, every read while B is active returns only B (AC-2.9)", async () => {
  const cache = await seeded();

  const expected = CACHE_STORES.map((store) => [[B.id, `B:${store}`]]);
  const all = await eachStore(async (store) =>
    (await cache.getAll(B.id, store)).map((e) => [e.accountId, e.data]),
  );
  expect(all).toEqual(expected);
  const one = await eachStore(async (store) => {
    const entry = await cache.get(B.id, store, '["k"]');
    return [[entry?.accountId, entry?.data]];
  });
  expect(one).toEqual(expected);

  const client = new QueryClient();
  await hydrateQueries(client, cache, B.id, { timeoutMs: 1000 });
  const restored = client
    .getQueryCache()
    .getAll()
    .map((q) => q.queryKey[1]);
  expect(restored.length).toBeGreaterThan(0);
  expect(new Set(restored)).toEqual(new Set([B.id]));
});

test("in a new session, the session-only account's records are gone from IndexedDB (AC-2.10)", async () => {
  const cache = await seeded();
  const accounts = createInMemoryAccountStore([A, B]);
  const newSession = (id: string) => id === B.id;

  await purgeSessionOnlyCaches(accounts, newSession, cache);

  const count = (id: typeof A.id) =>
    eachStore(async (store) => (await cache.getAll(id, store)).length);
  expect(await count(A.id)).toEqual(CACHE_STORES.map(() => 0));
  expect(await count(B.id)).toEqual(CACHE_STORES.map(() => 1));
});

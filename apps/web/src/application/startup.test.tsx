import { useQuery } from "@tanstack/react-query";
import { expect, test } from "vitest";
import { createInMemoryAccountStore } from "../../tests/fakes/in-memory-account-store.ts";
import { inMemoryCache } from "../../tests/fakes/in-memory-cache.ts";
import { renderWithProviders, testQueryClient } from "../../tests/render.tsx";
import { type Account, type AccountId, toAccountId } from "../domain/account.ts";
import { CACHE_STORES } from "./cache.ts";
import { hydrateQueries } from "./query-hydration.ts";
import { purgeSessionOnlyCaches } from "./startup.ts";

const account = (id: number, rememberMe: boolean): Account => ({
  id: toAccountId(id)!,
  login: `octo-${id}`,
  avatarUrl: "",
  tokenType: "fine-grained",
  scopes: [],
  rememberMe,
});
const SESSION_ONLY = account(1000001, false);
const REMEMBERED = account(1000002, true);
const STILL_IN_SESSION = account(1000003, false);

/** A new browser session: only the remembered token (localStorage) and one still-open session survive. */
const newSession = (id: AccountId) => id === REMEMBERED.id || id === STILL_IN_SESSION.id;

async function seed() {
  const cache = inMemoryCache({ now: () => new Date("2026-01-01T00:00:00.000Z") });
  await Promise.all(
    [SESSION_ONLY, REMEMBERED, STILL_IN_SESSION].flatMap((a) =>
      CACHE_STORES.map((store) => cache.put(a.id, store, '["home"]', { data: a.login })),
    ),
  );
  return cache;
}

type Cache = Awaited<ReturnType<typeof seed>>;
/** Records per store, in CACHE_STORES order. */
const counts = (cache: Cache, id: AccountId) =>
  Promise.all(CACHE_STORES.map(async (store) => (await cache.getAll(id, store)).length));
const none = CACHE_STORES.map(() => 0);
const one = CACHE_STORES.map(() => 1);

test("remember me off and no session token: every cached record is purged, the account stays (FR-2.13)", async () => {
  const cache = await seed();
  const accounts = createInMemoryAccountStore([SESSION_ONLY, REMEMBERED, STILL_IN_SESSION]);

  await purgeSessionOnlyCaches(accounts, newSession, cache);

  expect(await counts(cache, SESSION_ONLY.id)).toEqual(none);
  expect(await counts(cache, REMEMBERED.id)).toEqual(one);
  expect(await counts(cache, STILL_IN_SESSION.id)).toEqual(one);
  expect(accounts.get(SESSION_ONLY.id)).toEqual(SESSION_ONLY);
});

function Home({ accountId }: { accountId: AccountId }) {
  const { data } = useQuery({
    queryKey: ["prLists", accountId, "home"],
    queryFn: () => new Promise<string>(() => {}),
  });
  return <p>{data ?? "Loading"}</p>;
}

test("run in main.tsx's order, the purged records never reach the first render (AC-2.10)", async () => {
  const cache = await seed();
  const accounts = createInMemoryAccountStore([SESSION_ONLY, REMEMBERED]);
  accounts.setActive(SESSION_ONLY.id);
  const client = testQueryClient();

  await purgeSessionOnlyCaches(accounts, newSession, cache);
  await hydrateQueries(client, cache, accounts.activeId(), { timeoutMs: 300 });
  const screen = await renderWithProviders(<Home accountId={SESSION_ONLY.id} />, {
    queryClient: client,
  });

  await expect.element(screen.getByText("Loading")).toBeInTheDocument();
  expect(screen.container.textContent).not.toContain(SESSION_ONLY.login);
});

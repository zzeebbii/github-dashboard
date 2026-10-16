import { QueryClient } from "@tanstack/react-query";
import { expect, test } from "vitest";
import { createInMemoryAccountStore } from "../../tests/fakes/in-memory-account-store.ts";
import { createInMemoryAuth } from "../../tests/fakes/in-memory-auth.ts";
import { inMemoryCache } from "../../tests/fakes/in-memory-cache.ts";
import { type Account, toAccountId } from "../domain/account.ts";
import { createAccountActions } from "./accounts.ts";

const account = (id: number, login: string): Account => ({
  id: toAccountId(id)!,
  login,
  avatarUrl: "",
  tokenType: "fine-grained",
  scopes: [],
  rememberMe: false,
});
const A = account(1000001, "octo-a");
const B = account(1000002, "octo-b");
const result = (a: Account) => ({
  account: a,
  missingPermissions: [],
  ssoAuthorizationNeeded: false,
});

async function setup() {
  const accounts = createInMemoryAccountStore();
  const auth = createInMemoryAuth(accounts, { tokenA: result(A), tokenB: result(B) });
  await auth.signIn({ token: "tokenA", rememberMe: false });
  await auth.signIn({ token: "tokenB", rememberMe: true });
  const cache = inMemoryCache({ now: () => new Date("2026-01-01T00:00:00.000Z") });
  const queryClient = new QueryClient();
  const calls: string[] = [];
  const actions = createAccountActions({
    auth,
    accounts,
    cache,
    queryClient,
    hasToken: auth.hasToken,
    clearBrowserStorage: () => calls.push("clearBrowserStorage"),
    reload: () => calls.push("reload"),
  });
  return { accounts, auth, cache, queryClient, actions, calls };
}

test("switching restores the new account's cache, then makes it active", async () => {
  const { accounts, cache, queryClient, actions } = await setup();
  await cache.put(A.id, "prLists", '["home"]', { data: "A's PRs" });

  await actions.switchActive(A.id);

  expect(accounts.activeId()).toBe(A.id);
  expect(queryClient.getQueryData(["prLists", A.id, "home"])).toBe("A's PRs");
});

test("removing the active account deletes its token, record, queries and cache, then switches to one still signed in", async () => {
  const { accounts, auth, cache, queryClient, actions } = await setup();
  await cache.put(B.id, "seen", "pr-1", { data: true });
  await cache.put(A.id, "seen", "pr-1", { data: true });
  queryClient.setQueryData(["prLists", B.id, "home"], "B's PRs");

  await actions.remove(B.id);

  expect(auth.hasToken(B.id)).toBe(false);
  expect(accounts.get(B.id)).toBeUndefined();
  expect(queryClient.getQueryData(["prLists", B.id, "home"])).toBeUndefined();
  expect(await cache.getAll(B.id, "seen")).toEqual([]);
  expect(await cache.getAll(A.id, "seen")).toHaveLength(1);
  expect(accounts.activeId()).toBe(A.id);
});

test("removing the last signed-in account leaves no active account", async () => {
  const { accounts, auth, actions } = await setup();
  auth.signOut(A.id);

  await actions.remove(B.id);

  expect(accounts.activeId()).toBeNull();
});

test("removing an inactive account keeps the active one", async () => {
  const { accounts, actions } = await setup();

  await actions.remove(A.id);

  expect(accounts.activeId()).toBe(B.id);
});

test("sign out of everything clears the browser storage and the cache, then reloads", async () => {
  const { cache, queryClient, actions, calls } = await setup();
  await cache.put(A.id, "repos", "all", { data: 1 });
  queryClient.setQueryData(["repos", A.id], 1);

  await actions.signOutEverything();

  expect(calls).toEqual(["clearBrowserStorage", "reload"]);
  expect(cache.entries.size).toBe(0);
  expect(queryClient.getQueryCache().getAll()).toEqual([]);
});

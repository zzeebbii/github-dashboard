import { expect, test, vi } from "vitest";
import { type Account, toAccountId } from "../domain/account.ts";
import { createPatAuth } from "./auth/pat-auth.ts";
import { createTokenStorage } from "./auth/token-storage.ts";
import { createIndexedDbCache } from "./cache/indexeddb-cache.ts";
import { createLocalAccountStore } from "./local-account-store.ts";
import { renderApp } from "../../tests/render.tsx";

const TOKEN_A = "github_pat_FAKE_sign_out_fixture_token_a";
const TOKEN_B = "github_pat_FAKE_sign_out_fixture_token_b";

const account = (id: number, login: string, rememberMe: boolean): Account => ({
  id: toAccountId(id)!,
  login,
  avatarUrl: "",
  tokenType: "fine-grained",
  scopes: [],
  rememberMe,
});

test("after sign out of everything, localStorage, sessionStorage and the IndexedDB database are empty (AC-2.6)", async () => {
  // The real adapters over the real browser storage: no fakes between the action and the APIs.
  const name = `ghd-sign-out-${Date.now()}`;
  const cache = createIndexedDbCache({ clock: { now: () => new Date() }, name });
  const tokens = createTokenStorage();
  const accountStore = createLocalAccountStore();
  const auth = createPatAuth({
    tokens,
    accounts: accountStore,
    fetchImpl: () => Promise.reject(new Error("no network in this test")),
  });
  const a = account(1000001, "octo-a", true);
  const b = account(1000002, "octo-b", false);
  accountStore.upsert(a);
  accountStore.upsert(b);
  tokens.write(a.id, TOKEN_A, true);
  tokens.write(b.id, TOKEN_B, false);
  accountStore.setActive(a.id);
  await cache.put(a.id, "prLists", '["home"]', { data: "A's PRs" });
  await cache.put(b.id, "seen", "pr-1", { data: true });
  const reload = vi.fn<() => void>();

  const { screen } = await renderApp("/", {
    accountStore,
    auth,
    hasToken: (id) => tokens.read(id) !== null,
    cache,
    clearBrowserStorage: () => {
      tokens.clearAll();
    },
    reload,
  });
  await screen.getByRole("button", { name: "Account menu for octo-a" }).click();
  await screen.getByRole("menuitem", { name: "Sign out of everything" }).click();
  await screen
    .getByRole("dialog", { name: "Sign out of everything?" })
    .getByRole("button", { name: "Sign out of everything" })
    .click();

  await vi.waitFor(() => {
    expect(reload).toHaveBeenCalledOnce();
  });
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
  expect((await indexedDB.databases()).map((db) => db.name)).not.toContain(name);
});

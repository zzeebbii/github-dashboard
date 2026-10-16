import { expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import type { SignInResult } from "../../src/application/auth.ts";
import { type Account, toAccountId } from "../../src/domain/account.ts";
import { expectNoAxeViolations } from "../axe.ts";
import { createInMemoryAccountStore } from "../fakes/in-memory-account-store.ts";
import { createInMemoryAuth } from "../fakes/in-memory-auth.ts";
import { inMemoryCache } from "../fakes/in-memory-cache.ts";
import { renderApp, testQueryClient } from "../render.tsx";
import { guardAgainstTokenLeaks } from "../token-leak-guard.ts";

const TOKEN_A = "github_pat_FAKE_account_a_fixture_token";
const TOKEN_A_AGAIN = "github_pat_FAKE_account_a_second_token";
const TOKEN_B = "ghp_FAKE_account_b_classic_fixture_token";
guardAgainstTokenLeaks([TOKEN_A, TOKEN_A_AGAIN, TOKEN_B]);

const A: Account = {
  id: toAccountId(1000001)!,
  login: "octo-a",
  avatarUrl: "",
  tokenType: "fine-grained",
  scopes: [],
  rememberMe: false,
};
const B: Account = {
  id: toAccountId(1000002)!,
  login: "octo-b",
  avatarUrl: "",
  tokenType: "classic",
  scopes: ["repo", "read:org"],
  rememberMe: false,
};
const ok = (account: Account): SignInResult => ({
  account,
  missingPermissions: [],
  ssoAuthorizationNeeded: false,
});

type Auth = ReturnType<typeof createInMemoryAuth>;

async function setup(path = "/sign-in", before: (auth: Auth) => Promise<void> = async () => {}) {
  const accountStore = createInMemoryAccountStore();
  const auth = createInMemoryAuth(accountStore, {
    [TOKEN_A]: ok(A),
    [TOKEN_A_AGAIN]: ok(A),
    [TOKEN_B]: ok(B),
  });
  await before(auth);
  const cache = inMemoryCache({ now: () => new Date("2026-01-01T00:00:00.000Z") });
  const queryClient = testQueryClient();
  const app = await renderApp(path, {
    accountStore,
    auth,
    hasToken: auth.hasToken,
    cache,
    queryClient,
  });
  const { screen } = app;
  const signIn = async (token: string, { remember = false } = {}) => {
    await screen.getByLabelText("Personal access token").fill(token);
    if (remember) await screen.getByLabelText("Remember me on this device").click();
    await screen.getByRole("button", { name: "Sign in" }).click();
  };
  const menuButton = (login: string) =>
    screen.getByRole("button", { name: `Account menu for ${login}` });
  const openMenu = async (login: string) => {
    await menuButton(login).click();
    return screen.getByRole("menu");
  };
  return { ...app, auth, cache, queryClient, signIn, menuButton, openMenu };
}

/** A signed in, then B added from the menu. B is active. */
async function twoAccounts() {
  const app = await setup();
  await app.signIn(TOKEN_A);
  await expect.element(app.menuButton("octo-a")).toBeInTheDocument();
  await app.openMenu("octo-a");
  await app.screen.getByRole("menuitem", { name: "Add GitHub account" }).click();
  await app.signIn(TOKEN_B, { remember: true });
  // B's classic token has `repo`: sign-in shows the warning before continuing.
  await app.screen.getByRole("button", { name: "Continue to dashboard" }).click();
  await expect.element(app.menuButton("octo-b")).toBeInTheDocument();
  return app;
}

test("two accounts can be added and switched, each with only its own login and data (AC-2.4)", async () => {
  const { screen, cache, queryClient, openMenu, menuButton, accountStore } = await twoAccounts();
  await cache.put(A.id, "prLists", '["home"]', { data: "A's PRs" });

  const menu = await openMenu("octo-b");
  await expect
    .element(menu.getByRole("menuitemradio", { name: /octo-b/ }))
    .toHaveAttribute("aria-checked", "true");
  await expect
    .element(menu.getByRole("menuitemradio", { name: /octo-b/ }))
    .toMatchTextContent("Remembered on this device");
  await menu.getByRole("menuitemradio", { name: /octo-a/ }).click();

  await expect.element(menuButton("octo-a")).toBeInTheDocument();
  await expect.element(screen.getByRole("status")).toHaveTextContent("Switched to octo-a");
  expect(accountStore.activeId()).toBe(A.id);
  expect(queryClient.getQueryData(["prLists", A.id, "home"])).toBe("A's PRs");
  expect(queryClient.getQueryData(["prLists", B.id, "home"])).toBeUndefined();
});

test("re-adding the same GitHub user replaces its token and keeps one entry (AC-2.4)", async () => {
  const { screen, openMenu, signIn, accountStore, auth, queryClient } = await twoAccounts();
  queryClient.setQueryData(["prLists", A.id, "home"], "fetched with the old token");

  await openMenu("octo-b");
  await screen.getByRole("menuitem", { name: "Add GitHub account" }).click();
  await signIn(TOKEN_A_AGAIN);

  await openMenu("octo-a");
  expect(screen.getByRole("menuitemradio").elements()).toHaveLength(2);
  expect(accountStore.list().map((a) => a.login)).toEqual(["octo-a", "octo-b"]);
  // Promise.resolve: correct whether currentToken is sync or async.
  expect(await Promise.resolve(auth.currentToken(A.id))).toBe(TOKEN_A_AGAIN);
  // What A fetched before is refetched with the new token.
  expect(queryClient.getQueryState(["prLists", A.id, "home"])?.isInvalidated).toBe(true);
});

test("the menu passes axe closed and open, and warns about a write-scoped token", async () => {
  const { screen, openMenu } = await twoAccounts();
  await expectNoAxeViolations(screen.container);

  const menu = await openMenu("octo-b");

  await expect.element(menu).toHaveAccessibleDescription(/can write to your repositories/);
  await expectNoAxeViolations(screen.container);
});

test("keyboard: Down opens on the first item, arrows move, Esc closes and returns focus", async () => {
  const { screen, menuButton } = await twoAccounts();
  const button = menuButton("octo-b");
  (button.element() as HTMLElement).focus();

  await userEvent.keyboard("{ArrowDown}");
  await expect.element(screen.getByRole("menuitemradio", { name: /octo-a/ })).toHaveFocus();
  await userEvent.keyboard("{ArrowDown}");
  await expect.element(screen.getByRole("menuitemradio", { name: /octo-b/ })).toHaveFocus();
  await userEvent.keyboard("{End}");
  await expect
    .element(screen.getByRole("menuitem", { name: "Sign out of everything" }))
    .toHaveFocus();
  await userEvent.keyboard("{ArrowDown}");
  await expect.element(screen.getByRole("menuitemradio", { name: /octo-a/ })).toHaveFocus();
  await userEvent.keyboard("{Escape}");

  await expect.element(screen.getByRole("menu")).not.toBeInTheDocument();
  await expect.element(button).toHaveFocus();
  await expect.element(button).toHaveAttribute("aria-expanded", "false");

  await userEvent.keyboard("{ArrowUp}");
  await expect
    .element(screen.getByRole("menuitem", { name: "Sign out of everything" }))
    .toHaveFocus();
});

test("removing an account asks first; confirming deletes it and its cache, and switches to the other", async () => {
  const { screen, openMenu, menuButton, cache, accountStore } = await twoAccounts();
  await cache.put(B.id, "seen", "pr-1", { data: true });

  await openMenu("octo-b");
  await screen.getByRole("menuitem", { name: "Remove octo-b" }).click();
  const dialog = screen.getByRole("dialog", { name: "Remove octo-b?" });
  await expectNoAxeViolations(screen.container);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect.element(dialog).not.toBeInTheDocument();
  expect(accountStore.list()).toHaveLength(2);

  await openMenu("octo-b");
  await screen.getByRole("menuitem", { name: "Remove octo-b" }).click();
  await screen.getByRole("button", { name: "Remove account" }).click();

  await expect.element(menuButton("octo-a")).toBeInTheDocument();
  expect(accountStore.list().map((a) => a.login)).toEqual(["octo-a"]);
  expect(await cache.getAll(B.id, "seen")).toEqual([]);
});

test("a signed-out account shows as such and leads to sign-in for it (FR-2.8)", async () => {
  // Both signed in before; then a 401 (or a new session) took A's token but kept its record.
  const { screen, openMenu, router } = await setup("/", async (auth) => {
    await auth.signIn({ token: TOKEN_A, rememberMe: false });
    await auth.signIn({ token: TOKEN_B, rememberMe: true });
    auth.forgetToken(A.id);
  });

  const menu = await openMenu("octo-b");
  const entry = menu.getByRole("menuitemradio", { name: /octo-a/ });
  await expect.element(entry).toMatchTextContent("Signed out");
  await entry.click();

  await expect
    .element(screen.getByText("GitHub no longer accepts the token for octo-a.", { exact: false }))
    .toBeInTheDocument();
  expect(router.state.location.search).toEqual({ account: "octo-a" });
});

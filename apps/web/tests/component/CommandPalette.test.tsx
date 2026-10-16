import { afterEach, beforeAll, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { GitHubReadPort } from "../../src/application/github.ts";
import { type Account, toAccountId } from "../../src/domain/account.ts";
import type { PullRequest } from "../../src/domain/pull-request.ts";
import styles from "../../src/styles.css?inline";
import { expectNoAxeViolations } from "../axe.ts";
import { createInMemoryAccountStore } from "../fakes/in-memory-account-store.ts";
import { createInMemoryAuth } from "../fakes/in-memory-auth.ts";
import { createInMemoryGitHub } from "../fakes/in-memory-github.ts";
import { aPullRequest } from "../fakes/pull-request.ts";
import { renderApp, testQueryClient } from "../render.tsx";
import { guardAgainstTokenLeaks } from "../token-leak-guard.ts";

const TOKEN_A = "github_pat_FAKE_palette_a_fixture_token";
const TOKEN_B = "github_pat_FAKE_palette_b_fixture_token";
guardAgainstTokenLeaks([TOKEN_A, TOKEN_B]);

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

// The real stylesheet: axe's contrast checks depend on it.
beforeAll(() => {
  const sheet = document.createElement("style");
  sheet.textContent = styles;
  document.head.append(sheet);
});

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

const LOGIN_FIX = aPullRequest({
  id: "PR_12",
  repository: "acme/web",
  number: 12,
  title: "Fix login redirect",
});
const DRAFT = aPullRequest({
  id: "PR_40",
  repository: "acme/api",
  number: 40,
  title: "Draft: rate limiter",
  isDraft: true,
});

const result = (a: Account) => ({
  account: a,
  missingPermissions: [],
  ssoAuthorizationNeeded: false,
});

// By CSS, not by name: the dialog's name follows the language.
const groupNames = () =>
  [...document.querySelectorAll("dialog.palette [role=group]")]
    .map((g) => g.getAttribute("aria-labelledby"))
    .map((id) => (id === null ? null : document.getElementById(id)?.textContent));
const optionNames = () =>
  [...document.querySelectorAll("dialog.palette [role=option]")].map((o) => o.textContent);

interface Setup {
  /** false: GitHub answers with nothing, so the cache holds no repositories or PRs. */
  readonly cached?: boolean;
  /** false: account A has no favourites. */
  readonly favourites?: boolean;
}

/**
 * Two signed-in accounts, A active with one favourite. The fake GitHub fills the cache the
 * way the app does (Home, the sidebar), and counts every call made to it.
 */
async function setup({ cached = true, favourites = true }: Setup = {}) {
  const accountStore = createInMemoryAccountStore();
  const auth = createInMemoryAuth(accountStore, { [TOKEN_A]: result(A), [TOKEN_B]: result(B) });
  await auth.signIn({ token: TOKEN_B, rememberMe: false });
  await auth.signIn({ token: TOKEN_A, rememberMe: false });
  if (favourites) {
    accountStore.setFavourites(A.id, [{ nodeId: "R_fav", nameWithOwner: "acme/favourite" }]);
  }

  const prs: readonly PullRequest[] = cached ? [LOGIN_FIX, DRAFT] : [];
  const fake = createInMemoryGitHub(undefined, {
    searchHome: (_id, _login, search) =>
      Promise.resolve({
        ok: true,
        value: {
          data: {
            pullRequests: search === "authored" ? prs : [],
            nextCursor: null,
            totalCount: search === "authored" ? prs.length : 0,
          },
          partialErrors: [],
        },
      }),
    listRepos: () =>
      Promise.resolve({
        ok: true,
        value: {
          data: cached
            ? [
                {
                  id: "R_web",
                  nameWithOwner: "acme/web",
                  visibility: "PRIVATE",
                  description: null,
                },
                {
                  id: "R_fav",
                  nameWithOwner: "acme/favourite",
                  visibility: "PRIVATE",
                  description: null,
                },
              ]
            : [],
          partialErrors: [],
        },
      }),
  });
  // Every GitHub call goes through the port: count them all.
  let calls = 0;
  const github = Object.fromEntries(
    Object.entries(fake).map(([name, method]: [string, (...args: never[]) => unknown]) => [
      name,
      (...args: never[]) => {
        calls += 1;
        return method(...args);
      },
    ]),
  ) as unknown as GitHubReadPort;

  // Wide enough for the sidebar: one test types in its search field.
  await page.viewport(1280, 800);
  const queryClient = testQueryClient();
  const app = await renderApp("/", {
    accountStore,
    auth,
    hasToken: auth.hasToken,
    github,
    queryClient,
  });
  const { screen } = app;
  await expect.element(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  await expect.poll(() => queryClient.isFetching()).toBe(0);

  const trigger = screen.getByRole("button", { name: /Search repos and pull requests/u });
  const dialog = screen.getByRole("dialog", { name: "Command palette" });
  const combobox = dialog.getByRole("combobox");
  const activeOption = () => {
    const id = combobox.element().getAttribute("aria-activedescendant");
    return id === null ? null : document.getElementById(id)?.textContent;
  };
  return {
    ...app,
    accountStore,
    calls: () => calls,
    trigger,
    combobox,
    dialog,
    groupNames,
    optionNames,
    activeOption,
  };
}

const openWithShortcut = () => userEvent.keyboard("{Control>}k{/Control}");

test("opening and searching make zero GitHub calls and zero requests (AC-7.1)", async () => {
  const app = await setup();
  const callsBefore = app.calls();
  const requestsBefore = performance.getEntriesByType("resource").length;

  await openWithShortcut();
  await expect.element(app.combobox).toHaveFocus();
  for (const query of ["login", "#12", "12", "acme/", "zzz", ""]) {
    // oxlint-disable-next-line no-await-in-loop -- reason: each query is typed after the last
    await app.combobox.fill(query);
  }
  await expect.element(app.dialog).toBeVisible();

  expect(app.calls()).toBe(callsBefore);
  expect(performance.getEntriesByType("resource")).toHaveLength(requestsBefore);
});

test("results are grouped Favourites, Repositories, Pull requests, Actions", async () => {
  const app = await setup();
  await app.trigger.click();

  // Without a query: favourites and actions only.
  await expect.element(app.dialog).toBeVisible();
  expect(app.groupNames()).toEqual(["Favorites", "Actions"]);

  await app.combobox.fill("acme");
  await expect.poll(app.groupNames).toEqual(["Favorites", "Repositories", "Pull requests"]);
  // A favourite is not listed again under Repositories.
  expect(app.optionNames()).toEqual([
    "acme/favourite",
    "acme/web",
    "Fix login redirectweb#12",
    "Draft: rate limiterapi#40",
  ]);

  for (const query of ["#12", "12", "LOGIN"]) {
    // oxlint-disable-next-line no-await-in-loop -- reason: each query is typed after the last
    await app.combobox.fill(query);
    // oxlint-disable-next-line no-await-in-loop -- reason: as above
    await expect.poll(app.optionNames).toEqual(["Fix login redirectweb#12"]);
  }
  await expect.element(app.dialog.getByRole("status")).toHaveTextContent("1 result");

  await app.combobox.fill("theme");
  await expect.poll(app.optionNames).toEqual(["Switch to dark theme"]);
});

test("arrows, Home and End move; Enter opens the PR; Esc closes and restores focus (FR-7.2)", async () => {
  const app = await setup();
  await app.trigger.click();
  await app.combobox.fill("acme");
  await expect.poll(app.activeOption).toBe("acme/favourite");
  await expect.element(app.combobox).toHaveAttribute("aria-expanded", "true");

  await userEvent.keyboard("{ArrowDown}");
  expect(app.activeOption()).toBe("acme/web");
  await userEvent.keyboard("{End}");
  expect(app.activeOption()).toBe("Draft: rate limiterapi#40");
  await userEvent.keyboard("{ArrowDown}");
  expect(app.activeOption()).toBe("Draft: rate limiterapi#40");
  await userEvent.keyboard("{Home}");
  expect(app.activeOption()).toBe("acme/favourite");
  await userEvent.keyboard("{ArrowUp}{ArrowDown}{ArrowDown}");
  expect(app.activeOption()).toBe("Fix login redirectweb#12");
  await expect
    .element(app.dialog.getByRole("option", { name: /Fix login redirect/u }))
    .toHaveAttribute("aria-selected", "true");

  await userEvent.keyboard("{Enter}");
  await expect.poll(() => app.router.state.location.pathname).toBe("/repo/acme/web/pull/12");
  await expect.element(app.dialog).not.toBeInTheDocument();

  // The PR panel covers the header; back Home, the header's button opens the palette.
  await app.router.navigate({ to: "/" });
  await app.trigger.click();
  await expect.element(app.combobox).toHaveFocus();
  await userEvent.keyboard("{Escape}");
  await expect.element(app.dialog).not.toBeInTheDocument();
  await expect.element(app.trigger).toHaveFocus();
});

test("⌘K toggles the palette, also from a text field", async () => {
  const app = await setup();
  await app.screen.getByRole("searchbox", { name: "Search repositories" }).click();

  await userEvent.keyboard("{Meta>}k{/Meta}");
  await expect.element(app.combobox).toHaveFocus();
  await userEvent.keyboard("{Meta>}k{/Meta}");
  await expect.element(app.dialog).not.toBeInTheDocument();
  await expect
    .element(app.screen.getByRole("searchbox", { name: "Search repositories" }))
    .toHaveFocus();
});

test("axe passes with the palette open, in both themes (AC-7.5)", async () => {
  const app = await setup();
  await openWithShortcut();
  await app.combobox.fill("a");
  await expect
    .poll(app.groupNames)
    .toEqual(["Favorites", "Repositories", "Pull requests", "Actions"]);
  await expectNoAxeViolations(app.screen.container);

  await app.combobox.fill("nothing matches this");
  await expect.element(app.dialog.getByText("No results.").first()).toBeVisible();
  await expect.element(app.combobox).toHaveAttribute("aria-expanded", "false");
  await expectNoAxeViolations(app.screen.container);
});

test("Switch account to <login> switches, announces and goes Home", async () => {
  const app = await setup();
  await app.router.navigate({ to: "/settings" });
  await openWithShortcut();
  await app.combobox.fill("switch account");
  await expect.poll(app.optionNames).toEqual(["Switch account to octo-b"]);

  await userEvent.keyboard("{Enter}");

  await expect
    .element(app.screen.getByRole("button", { name: "Account menu for octo-b" }))
    .toBeInTheDocument();
  expect(app.accountStore.activeId()).toBe(B.id);
  expect(app.router.state.location.pathname).toBe("/");
  await expect.element(app.screen.getByText("Switched to octo-b")).toBeInTheDocument();
});

test("Language: Suomi switches the language; the theme action switches the theme", async () => {
  const app = await setup();
  await openWithShortcut();
  await app.combobox.fill("dark");
  await userEvent.keyboard("{Enter}");
  await expect.poll(() => document.documentElement.classList.contains("dark")).toBe(true);

  await openWithShortcut();
  await app.combobox.fill("suomi");
  await expect.poll(app.optionNames).toEqual(["Language: Suomi"]);
  await userEvent.keyboard("{Enter}");

  await expect.poll(() => document.documentElement.lang).toBe("fi");
  await openWithShortcut();
  await expect.element(app.screen.getByRole("dialog", { name: "Komentopaletti" })).toBeVisible();
  expect(app.optionNames()).toContain("Vaihda vaaleaan teemaan");
});

test("with an empty cache and no query, only Actions are shown", async () => {
  const app = await setup({ cached: false, favourites: false });
  await openWithShortcut();

  await expect.element(app.dialog).toBeVisible();
  expect(app.groupNames()).toEqual(["Actions"]);
  expect(app.optionNames()).toEqual([
    "Go to Home",
    "Switch to dark theme",
    "Refresh",
    "Language: Suomi",
    "Language: Svenska",
    "Switch account to octo-b",
  ]);

  // A query finds no repository or PR either: nothing was cached, and nothing is fetched.
  const callsBefore = app.calls();
  await app.combobox.fill("acme");
  await expect.element(app.dialog.getByText("No results.").first()).toBeVisible();
  expect(app.calls()).toBe(callsBefore);
});

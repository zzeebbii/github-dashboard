import { afterEach, beforeAll, expect, test } from "vitest";
import { page as browser, userEvent } from "vitest/browser";
import type {
  GitHubReadPort,
  HomeSearch,
  RepoPullRequestPage,
} from "../../src/application/github.ts";
import { defaultPreferences, type Preferences } from "../../src/application/preferences.ts";
import { type Account, toAccountId } from "../../src/domain/account.ts";
import type { PullRequest } from "../../src/domain/pull-request.ts";
import styles from "../../src/styles.css?inline";
import { expectNoAxeViolations } from "../axe.ts";
import { createInMemoryAccountStore } from "../fakes/in-memory-account-store.ts";
import { createInMemoryAuth } from "../fakes/in-memory-auth.ts";
import { createInMemoryGitHub } from "../fakes/in-memory-github.ts";
import { createInMemoryPreferencesStore } from "../fakes/in-memory-preferences-store.ts";
import { aPullRequest } from "../fakes/pull-request.ts";
import { renderApp } from "../render.tsx";
import { guardAgainstTokenLeaks } from "../token-leak-guard.ts";

const TOKEN = "github_pat_FAKE_shortcuts_fixture_token";
guardAgainstTokenLeaks([TOKEN]);

const ACCOUNT: Account = {
  id: toAccountId(1000001)!,
  login: "octo-me",
  avatarUrl: "",
  tokenType: "fine-grained",
  scopes: [],
  rememberMe: false,
};
const me = { login: "octo-me", typename: "User" };
const bob = { login: "bob", typename: "User" };

beforeAll(() => {
  const sheet = document.createElement("style");
  sheet.textContent = styles;
  document.head.append(sheet);
});

afterEach(async () => {
  document.documentElement.classList.remove("dark");
  await browser.viewport(1280, 800);
});

const review = (id: string, title: string) =>
  aPullRequest({
    id,
    number: Number(id.replace(/\D/gu, "")),
    title,
    author: bob,
    reviewRequests: [{ kind: "user", login: "octo-me" }],
  });

/** Two to review, one needing action, one waiting: three sections, four rows. */
const HOME: Partial<Record<HomeSearch, readonly PullRequest[]>> = {
  "review-requested": [review("PR_1", "First review"), review("PR_2", "Second review")],
  authored: [
    aPullRequest({
      id: "PR_3",
      number: 3,
      title: "Needs my action",
      author: me,
      reviewDecision: "CHANGES_REQUESTED",
    }),
    aPullRequest({ id: "PR_4", number: 4, title: "Waiting on others", author: me }),
  ],
};

interface Setup {
  readonly path?: string;
  readonly searches?: Partial<Record<HomeSearch, readonly PullRequest[]>>;
  readonly listRepoPullRequests?: GitHubReadPort["listRepoPullRequests"];
  readonly preferences?: Partial<Preferences>;
}

async function renderShortcuts(options: Setup = {}) {
  const accountStore = createInMemoryAccountStore();
  const auth = createInMemoryAuth(accountStore, {
    [TOKEN]: { account: ACCOUNT, missingPermissions: [], ssoAuthorizationNeeded: false },
  });
  await auth.signIn({ token: TOKEN, rememberMe: false });
  const searches = options.searches ?? HOME;
  const github = createInMemoryGitHub(undefined, {
    searchHome: (_accountId, _login, search) => {
      const pullRequests = searches[search] ?? [];
      return Promise.resolve({
        ok: true,
        value: {
          data: { pullRequests, nextCursor: null, totalCount: pullRequests.length },
          partialErrors: [],
        },
      });
    },
    ...(options.listRepoPullRequests === undefined
      ? {}
      : { listRepoPullRequests: options.listRepoPullRequests }),
  });
  const preferencesStore = createInMemoryPreferencesStore({
    ...defaultPreferences,
    ...options.preferences,
  });
  const app = await renderApp(options.path ?? "/", {
    accountStore,
    auth,
    hasToken: auth.hasToken,
    github,
    preferencesStore,
  });
  return { ...app, preferencesStore };
}

/** The title of the row that has focus, if focus is on a row's title link. */
const focusedTitle = () =>
  document.activeElement?.matches("a.pr-title") === true
    ? document.activeElement.textContent
    : null;
const selectedTitle = () =>
  document.querySelector("li[data-selected] a.pr-title")?.textContent ?? null;
const filterBox = () => browser.getByRole("searchbox", { name: "Filter pull requests" });

async function press(keys: string) {
  await userEvent.keyboard(keys);
}

test("J/K move through Home's three sections as one list; the row shows it is selected", async () => {
  await renderShortcuts();
  await expect.element(browser.getByText("Waiting on others")).toBeVisible();

  await press("j");
  await expect.poll(focusedTitle).toBe("First review");
  expect(selectedTitle()).toBe("First review");

  await press("jj");
  await expect.poll(focusedTitle).toBe("Needs my action");
  await press("j");
  await expect.poll(focusedTitle).toBe("Waiting on others");
  // At the end it stays.
  await press("j");
  await expect.poll(focusedTitle).toBe("Waiting on others");

  await press("kkk");
  await expect.poll(focusedTitle).toBe("First review");

  // The selection is shown by a bar on the row's left edge, not by colour alone.
  const row = document.querySelector("li[data-selected] .pr-row");
  expect(row === null ? "" : getComputedStyle(row).boxShadow).toMatch(/inset/u);
  await expectNoAxeViolations(document.body);
});

test("a row focused with Tab or a click is where J continues from", async () => {
  await renderShortcuts();
  await expect.element(browser.getByText("Needs my action")).toBeVisible();

  document.querySelector<HTMLElement>('a.pr-title[href$="/pull/3"]')?.focus();
  await press("j");

  await expect.poll(focusedTitle).toBe("Waiting on others");
});

test("a collapsed section is skipped", async () => {
  await renderShortcuts();
  await browser.getByRole("button", { name: /Your pull requests · needs action/ }).click();

  // From the section's toggle, which is in the page body.
  await press("jjj");

  await expect.poll(focusedTitle).toBe("Waiting on others");
});

test("typing j in the filter types j and moves nothing (AC-7.2); / focuses the filter", async () => {
  await renderShortcuts();
  await expect.element(browser.getByText("First review")).toBeVisible();

  await press("/");
  await expect.element(filterBox()).toHaveFocus();
  // The slash went to the shortcut, not into the box.
  await expect.element(filterBox()).toHaveValue("");

  await press("j");

  await expect.element(filterBox()).toHaveValue("j");
  expect(selectedTitle()).toBeNull();
});

test("J, K, / and arrows are inert while the sidebar's splitter has focus", async () => {
  await renderShortcuts();
  await expect.element(browser.getByText("First review")).toBeVisible();
  const splitter = browser.getByRole("separator", { name: "Resize sidebar" });
  splitter.element().focus();

  await press("jk/{ArrowRight}");

  await expect.element(splitter).toHaveFocus();
  expect(selectedTitle()).toBeNull();
  await expect.element(filterBox()).not.toHaveFocus();
  // The arrow was the splitter's: 264 + 16.
  await expect.element(splitter).toHaveAttribute("aria-valuenow", "280");
});

test("with J/K turned off in Settings, J does nothing (AC-7.3)", async () => {
  const { router, preferencesStore } = await renderShortcuts({ path: "/settings" });

  const toggle = browser.getByRole("checkbox", { name: "Move through lists with J and K" });
  await expect.element(toggle).toBeChecked();
  await toggle.click();
  expect(preferencesStore.load().listShortcutsEnabled).toBe(false);

  await router.navigate({ to: "/" });
  await expect.element(browser.getByText("First review")).toBeVisible();
  (document.activeElement as HTMLElement | null)?.blur();
  await press("jj");

  expect(selectedTitle()).toBeNull();
  expect(document.activeElement).toBe(document.body);
  // Its hint is gone too; the others stay.
  expect(document.querySelector(".kbd-hints")?.textContent).not.toContain("move");
  expect(document.querySelector(".kbd-hints")?.textContent).toContain("open");
});

test("Enter opens the selected row's panel; J/K are inert in it; Esc returns focus to the row", async () => {
  const { router } = await renderShortcuts();
  await expect.element(browser.getByText("Second review")).toBeVisible();

  await press("jj");
  await expect.poll(focusedTitle).toBe("Second review");
  await press("{Enter}");

  const panel = browser.getByRole("dialog");
  await expect.element(panel).toBeVisible();
  expect(router.state.location.search).toMatchObject({ pull: "acme/app/2" });

  // The panel's heading has focus; the list underneath must not move.
  await press("jk/");
  expect(selectedTitle()).toBe("Second review");
  expect(router.state.location.search).toMatchObject({ pull: "acme/app/2" });

  await press("{Escape}");
  await expect.element(panel).not.toBeInTheDocument();
  await expect.poll(focusedTitle).toBe("Second review");
});

test("Enter opens the selection when focus fell back to the page", async () => {
  const { router } = await renderShortcuts();
  await expect.element(browser.getByText("First review")).toBeVisible();
  await press("j");
  await expect.poll(focusedTitle).toBe("First review");
  document.getElementById("main")?.focus();

  await press("{Enter}");

  await expect.element(browser.getByRole("dialog")).toBeVisible();
  expect(router.state.location.search).toMatchObject({ pull: "acme/app/1" });
});

test("J/K are inert while the command palette is open", async () => {
  await renderShortcuts();
  await expect.element(browser.getByText("First review")).toBeVisible();

  await press("{Control>}k{/Control}");
  const palette = browser.getByRole("dialog", { name: "Command palette" });
  await expect.element(palette).toBeVisible();
  await press("jj");

  // They were typed into the palette's search, and the list did not move.
  await expect.element(palette.getByRole("combobox")).toHaveValue("jj");
  expect(selectedTitle()).toBeNull();
  await press("{Escape}");
  await expect.element(palette).not.toBeInTheDocument();
});

test("in a windowed list of 500, J reaches a row that is not rendered, scrolls it in and focuses it", async () => {
  const many = Array.from({ length: 500 }, (_, i) => review(`PR_${i + 1}`, `Change ${i + 1}`));
  await renderShortcuts({ searches: { "review-requested": many } });
  await expect.element(browser.getByText("Change 1", { exact: true })).toBeVisible();

  await press("j");
  await expect.poll(focusedTitle).toBe("Change 1");
  for (let i = 0; i < 29; i += 1) {
    // oxlint-disable-next-line no-await-in-loop -- reason: one key press at a time, in order
    await press("j");
  }
  await expect.poll(focusedTitle).toBe("Change 30");

  // Scroll far away with the mouse wheel: row 30 is unmounted and focus falls to the page.
  const main = document.getElementById("main");
  const scroller =
    main !== null && main.scrollHeight > main.clientHeight ? main : document.scrollingElement;
  scroller?.scrollTo({ top: 400 * 64 });
  await expect.poll(() => document.querySelector('a.pr-title[href$="/pull/30"]')).toBeNull();

  await press("j");

  await expect.poll(focusedTitle).toBe("Change 31");
  const rect = document.activeElement?.getBoundingClientRect();
  expect(rect !== undefined && rect.top >= 0 && rect.bottom <= window.innerHeight).toBe(true);
  expect(document.activeElement?.closest("li")?.getAttribute("aria-posinset")).toBe("31");
});

test("on the repository page J selects and Enter opens the panel over it", async () => {
  const prs = [
    aPullRequest({ id: "R1", number: 11, title: "Repo one" }),
    aPullRequest({ id: "R2", number: 12, title: "Repo two" }),
  ];
  const repoPage: RepoPullRequestPage = {
    repository: {
      id: "R_repo",
      nameWithOwner: "acme/app",
      visibility: "PUBLIC",
      description: null,
      url: "https://github.com/acme/app",
    },
    page: { pullRequests: prs, nextCursor: null, totalCount: prs.length },
  };
  const { router } = await renderShortcuts({
    path: "/repo/acme/app",
    listRepoPullRequests: () =>
      Promise.resolve({ ok: true, value: { data: repoPage, partialErrors: [] } }),
  });
  await expect.element(browser.getByText("Repo two")).toBeVisible();

  await press("jj");
  await expect.poll(focusedTitle).toBe("Repo two");
  await expectNoAxeViolations(document.body);
  await press("{Enter}");

  await expect.element(browser.getByRole("dialog")).toBeVisible();
  expect(router.state.location.pathname).toBe("/repo/acme/app/pull/12");
});

test("a view without a filter ignores /", async () => {
  await renderShortcuts({ path: "/settings" });
  await expect.element(browser.getByRole("heading", { name: "Settings" })).toBeVisible();

  await press("/");

  expect(document.activeElement).toBe(document.body);
});

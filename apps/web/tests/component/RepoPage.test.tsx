import { afterEach, beforeAll, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import type { GitHubReadPort, RepoPullRequestPage } from "../../src/application/github.ts";
import { defaultPreferences } from "../../src/application/preferences.ts";
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

const TOKEN = "github_pat_FAKE_repo_page_fixture_token";
guardAgainstTokenLeaks([TOKEN]);

const ACCOUNT: Account = {
  id: toAccountId(1000001)!,
  login: "octo-me",
  avatarUrl: "",
  tokenType: "fine-grained",
  scopes: [],
  rememberMe: false,
};
const REPO_ID = "R_acme_app";
const review = {
  author: { login: "bob", typename: "User" },
  state: "APPROVED",
  submittedAt: "2026-10-02T00:00:00Z",
} as const;

beforeAll(() => {
  const sheet = document.createElement("style");
  sheet.textContent = styles;
  document.head.append(sheet);
});

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

/** AC-4.5's fixture: 2 drafts, 2 unreviewed and 1 reviewed ready PRs, all open. */
const FIXTURE: readonly PullRequest[] = [
  aPullRequest({ id: "d1", number: 1, title: "Draft one", isDraft: true }),
  aPullRequest({ id: "d2", number: 2, title: "Draft two", isDraft: true, reviews: [review] }),
  aPullRequest({ id: "u1", number: 3, title: "Unreviewed one" }),
  aPullRequest({ id: "u2", number: 4, title: "Unreviewed two" }),
  aPullRequest({ id: "r1", number: 5, title: "Reviewed", reviews: [review] }),
];

const pageOf = (
  pullRequests: readonly PullRequest[],
  nextCursor: string | null = null,
  totalCount = pullRequests.length,
): RepoPullRequestPage => ({
  repository: {
    id: REPO_ID,
    nameWithOwner: "acme/app",
    visibility: "PRIVATE",
    description: "The app",
    url: "https://github.com/acme/app",
  },
  page: { pullRequests, nextCursor, totalCount },
});

interface Setup {
  readonly path?: string;
  readonly listRepoPullRequests?: GitHubReadPort["listRepoPullRequests"];
  readonly refreshFavourites?: GitHubReadPort["refreshFavourites"];
  readonly favourite?: boolean;
  readonly density?: "comfortable" | "compact";
}

async function renderRepo(options: Setup = {}) {
  const accountStore = createInMemoryAccountStore();
  const auth = createInMemoryAuth(accountStore, {
    [TOKEN]: { account: ACCOUNT, missingPermissions: [], ssoAuthorizationNeeded: false },
  });
  await auth.signIn({ token: TOKEN, rememberMe: false });
  if (options.favourite === true) {
    accountStore.setFavourites(ACCOUNT.id, [{ nodeId: REPO_ID, nameWithOwner: "acme/app" }]);
  }
  const calls: (string | null)[] = [];
  const github = createInMemoryGitHub(undefined, {
    listRepoPullRequests: (accountId, login, repository, after) => {
      calls.push(after);
      return (
        options.listRepoPullRequests?.(accountId, login, repository, after) ??
        Promise.resolve({ ok: true, value: { data: pageOf(FIXTURE), partialErrors: [] } })
      );
    },
    ...(options.refreshFavourites === undefined
      ? {}
      : { refreshFavourites: options.refreshFavourites }),
  });
  const preferencesStore = createInMemoryPreferencesStore({
    ...defaultPreferences,
    density: options.density ?? "comfortable",
  });
  const app = await renderApp(options.path ?? "/repo/acme/app", {
    accountStore,
    auth,
    hasToken: auth.hasToken,
    github,
    preferencesStore,
  });
  return { ...app, calls };
}

type Screen = Awaited<ReturnType<typeof renderRepo>>["screen"];
const tab = (screen: Screen, name: RegExp) => screen.getByRole("tab", { name });

test("tabs count open, draft and unreviewed PRs and list them (AC-4.5)", async () => {
  const { screen, calls } = await renderRepo();

  await expect.element(screen.getByRole("heading", { name: "acme / app" })).toBeVisible();
  await expect.element(screen.getByText("Private")).toBeVisible();
  await expect.element(screen.getByText("The app")).toBeVisible();
  await expect.element(tab(screen, /^Open/)).toHaveTextContent("Open5");
  await expect.element(tab(screen, /^Draft/)).toHaveTextContent("Draft2");
  await expect.element(tab(screen, /^Needs review/)).toHaveTextContent("Needs review2");
  await expect.element(tab(screen, /^Open/)).toHaveAttribute("aria-selected", "true");
  expect(document.querySelectorAll(".pr-row")).toHaveLength(5);
  expect(document.querySelector(".repo-header a")?.getAttribute("href")).toBe(
    "https://github.com/acme/app",
  );

  await tab(screen, /^Needs review/).click();

  await expect.element(screen.getByRole("link", { name: /Unreviewed one/ })).toBeVisible();
  expect(document.querySelectorAll(".pr-row")).toHaveLength(2);
  await expect.element(screen.getByRole("link", { name: /Draft one/ })).not.toBeInTheDocument();
  // One page, one request; closed PRs are never asked for (the port only lists open ones).
  expect(calls).toEqual([null]);
});

test("arrow keys, Home and End move between tabs; the tab is in the URL and survives a reload", async () => {
  const { screen, router } = await renderRepo();
  await expect.element(tab(screen, /^Open/)).toBeVisible();
  (tab(screen, /^Open/).element() as HTMLElement).focus();

  await userEvent.keyboard("{ArrowRight}");
  await expect.element(tab(screen, /^Draft/)).toHaveFocus();
  await expect.element(tab(screen, /^Draft/)).toHaveAttribute("aria-selected", "true");
  await expect.element(tab(screen, /^Draft/)).toHaveAttribute("tabindex", "0");
  await expect.element(tab(screen, /^Open/)).toHaveAttribute("tabindex", "-1");
  await expect.poll(() => router.state.location.search).toEqual({ tab: "draft" });

  await userEvent.keyboard("{End}");
  await expect.element(tab(screen, /^Needs review/)).toHaveFocus();
  await userEvent.keyboard("{ArrowRight}");
  await expect.element(tab(screen, /^Open/)).toHaveFocus();
  await userEvent.keyboard("{ArrowLeft}");
  await expect.element(tab(screen, /^Needs review/)).toHaveFocus();
  await userEvent.keyboard("{Home}");
  await expect.element(tab(screen, /^Open/)).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => router.state.location.search).toEqual({});
});

test("a reload keeps the tab and the filters beside it, and filtering keeps the tab", async () => {
  const { screen, router } = await renderRepo({ path: "/repo/acme/app?tab=review&q=two" });
  await expect.element(tab(screen, /^Needs review/)).toHaveAttribute("aria-selected", "true");
  await expect.element(screen.getByRole("link", { name: /Unreviewed two/ })).toBeVisible();
  await expect
    .element(screen.getByRole("link", { name: /Unreviewed one/ }))
    .not.toBeInTheDocument();

  await screen.getByRole("searchbox", { name: "Filter pull requests" }).fill("one");

  await expect.poll(() => router.state.location.search).toEqual({ tab: "review", q: "one" });
  await expect.element(screen.getByRole("link", { name: /Unreviewed one/ })).toBeVisible();
});

test.each(["comfortable", "compact"] as const)(
  "passes axe in both themes at %s density",
  async (density) => {
    const { screen } = await renderRepo({ density, favourite: true });
    await expect.element(tab(screen, /^Open/)).toBeVisible();
    expect(document.querySelector(".pr-row")?.getAttribute("data-density")).toBe(density);
    await expectNoAxeViolations(screen.container);
  },
);

test("the favourite toggle stars and unstars the repository", async () => {
  const { screen, accountStore } = await renderRepo();
  const star = screen.getByRole("button", { name: "Favorite" });
  await expect.element(star).toHaveAttribute("aria-pressed", "false");

  await star.click();
  await expect.element(star).toHaveAttribute("aria-pressed", "true");
  expect(accountStore.favourites(ACCOUNT.id)).toEqual([
    { nodeId: REPO_ID, nameWithOwner: "acme/app" },
  ]);

  await star.click();
  await expect.element(star).toHaveAttribute("aria-pressed", "false");
  expect(accountStore.favourites(ACCOUNT.id)).toEqual([]);
});

test("a favourite's open count shows from the favourites batch while the rows load", async () => {
  const { screen } = await renderRepo({
    favourite: true,
    listRepoPullRequests: () => new Promise(() => undefined),
    refreshFavourites: () =>
      Promise.resolve({
        ok: true,
        value: {
          data: [
            {
              kind: "found",
              nodeId: REPO_ID,
              nameWithOwner: "acme/app",
              openCount: 7,
              pullRequests: [],
            },
          ],
          partialErrors: [],
        },
      }),
  });
  await expect.element(screen.getByText("Loading pull requests…")).toBeVisible();
  await expect.element(screen.getByText(/7\s*open/)).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Favorite" }))
    .toHaveAttribute("aria-pressed", "true");
});

test("a repository that does not exist says so, without a crash", async () => {
  const { screen } = await renderRepo({
    listRepoPullRequests: () => Promise.resolve({ ok: false, error: { kind: "notFound" } }),
  });
  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("This repository does not exist, or this account cannot see it.");
  await expect.element(screen.getByRole("heading", { name: "acme / app" })).toBeVisible();
  await expect.element(screen.getByRole("tablist")).not.toBeInTheDocument();
});

test("a repository GitHub refuses shows the access message", async () => {
  const { screen } = await renderRepo({
    listRepoPullRequests: () =>
      Promise.resolve({
        ok: false,
        error: {
          kind: "orgAccess",
          issue: { org: "acme", reason: "sso", fixUrl: "https://github.com/orgs/acme/sso" },
        },
      }),
  });
  await expect
    .element(screen.getByRole("alert").filter({ hasText: "refused this account access" }))
    .toBeVisible();
});

test("Load more fetches the next 20; counts say + while pages remain", async () => {
  const first = Array.from({ length: 20 }, (_, i) =>
    aPullRequest({ id: `p${i}`, number: i + 1, title: `Change ${i + 1}`, isDraft: i < 3 }),
  );
  const rest = [aPullRequest({ id: "p20", number: 21, title: "Change 21", isDraft: true })];
  const { screen, calls } = await renderRepo({
    listRepoPullRequests: (_a, _l, _r, after) =>
      Promise.resolve({
        ok: true,
        value: {
          data: after === null ? pageOf(first, "c1", 21) : pageOf(rest, null, 21),
          partialErrors: [],
        },
      }),
  });
  await expect.element(tab(screen, /^Open/)).toHaveTextContent("Open21");
  await expect.element(tab(screen, /^Draft/)).toHaveTextContent("Draft3+");

  await screen.getByRole("button", { name: "Load more" }).click();

  await expect.element(tab(screen, /^Draft/)).toHaveTextContent("Draft4");
  await expect.element(screen.getByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  expect(calls).toEqual([null, "c1"]);
});

test("the GitHub link is only shown for github.com URLs", async () => {
  const { screen } = await renderRepo({
    listRepoPullRequests: () =>
      Promise.resolve({
        ok: true,
        value: {
          data: {
            ...pageOf(FIXTURE),
            repository: { ...pageOf(FIXTURE).repository, url: "https://evil.example/acme/app" },
          },
          partialErrors: [],
        },
      }),
  });
  await expect.element(tab(screen, /^Open/)).toBeVisible();
  expect(document.querySelector(".repo-header a")).toBeNull();
});

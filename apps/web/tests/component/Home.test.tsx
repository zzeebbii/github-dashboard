import { afterEach, beforeAll, expect, test } from "vitest";
import type {
  ActivitySinceRequest,
  GitHubReadPort,
  HomeSearch,
  PullRequestPage,
} from "../../src/application/github.ts";
import { defaultPreferences } from "../../src/application/preferences.ts";
import { createSeenMarkers } from "../../src/application/seen.ts";
import { type Account, toAccountId } from "../../src/domain/account.ts";
import type { PullRequest } from "../../src/domain/pull-request.ts";
import styles from "../../src/styles.css?inline";
import { expectNoAxeViolations } from "../axe.ts";
import { advanceableClock } from "../determinism.ts";
import { createInMemoryAccountStore } from "../fakes/in-memory-account-store.ts";
import { createInMemoryAuth } from "../fakes/in-memory-auth.ts";
import { inMemoryCache } from "../fakes/in-memory-cache.ts";
import { createInMemoryGitHub } from "../fakes/in-memory-github.ts";
import { createInMemoryPreferencesStore } from "../fakes/in-memory-preferences-store.ts";
import { aPullRequest } from "../fakes/pull-request.ts";
import { renderApp } from "../render.tsx";
import { guardAgainstTokenLeaks } from "../token-leak-guard.ts";

const TOKEN = "github_pat_FAKE_home_fixture_token";
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

// The real stylesheet: axe's contrast checks depend on it.
beforeAll(() => {
  const sheet = document.createElement("style");
  sheet.textContent = styles;
  document.head.append(sheet);
});

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

const page = (pullRequests: readonly PullRequest[]): PullRequestPage => ({
  pullRequests,
  nextCursor: null,
  totalCount: pullRequests.length,
});

interface Setup {
  readonly searches?: Partial<Record<HomeSearch, readonly PullRequest[]>>;
  readonly searchHome?: GitHubReadPort["searchHome"];
  readonly getActivitySince?: GitHubReadPort["getActivitySince"];
  /** PR id → when its seen marker is set, before Home renders. */
  readonly seenAt?: Readonly<Record<string, string>>;
  readonly density?: "comfortable" | "compact";
}

async function renderHome(options: Setup = {}) {
  const accountStore = createInMemoryAccountStore();
  const auth = createInMemoryAuth(accountStore, {
    [TOKEN]: { account: ACCOUNT, missingPermissions: [], ssoAuthorizationNeeded: false },
  });
  await auth.signIn({ token: TOKEN, rememberMe: false });

  const clock = advanceableClock("2026-10-01T00:00:00Z");
  const seen = createSeenMarkers(inMemoryCache(clock));
  for (const [prId, at] of Object.entries(options.seenAt ?? {})) {
    clock.advance(new Date(at).getTime() - clock.now().getTime());
    // oxlint-disable-next-line no-await-in-loop -- reason: each marker is stamped at its own time
    await seen.markSeen(ACCOUNT.id, prId);
  }
  const activityCalls: ActivitySinceRequest[][] = [];
  const github = createInMemoryGitHub(
    {
      ok: true,
      value: {
        data: {
          login: ACCOUNT.login,
          name: null,
          avatarUrl: "",
          organizations: [{ login: "acme", name: null, avatarUrl: "", teams: ["web"] }],
        },
        partialErrors: [],
      },
    },
    {
      searchHome:
        options.searchHome ??
        ((_accountId, _login, search) =>
          Promise.resolve({
            ok: true,
            value: { data: page(options.searches?.[search] ?? []), partialErrors: [] },
          })),
      getActivitySince: (accountId, requests) => {
        activityCalls.push([...requests]);
        return (
          options.getActivitySince?.(accountId, requests) ??
          Promise.resolve({ ok: true, value: { data: requests.map(() => []), partialErrors: [] } })
        );
      },
    },
  );
  const preferencesStore = createInMemoryPreferencesStore({
    ...defaultPreferences,
    density: options.density ?? "comfortable",
  });
  const app = await renderApp("/", {
    accountStore,
    auth,
    hasToken: auth.hasToken,
    github,
    seen,
    preferencesStore,
  });
  return { ...app, clock, activityCalls };
}

/** A section heading's count badge. */
const countOf = (toggle: Element) => toggle.querySelector(".home-section-count")?.textContent;

const section = (screen: Awaited<ReturnType<typeof renderHome>>["screen"], name: string) =>
  screen.getByRole("region", { name });

test("a review request on a repository that is not a favourite is in Needs your review (AC-5.4)", async () => {
  const { screen } = await renderHome({
    searches: {
      "review-requested": [
        aPullRequest({
          id: "PR_req",
          repository: "elsewhere/not-a-favourite",
          number: 7,
          title: "Please review me",
          author: bob,
          reviewRequests: [{ kind: "user", login: "octo-me" }],
        }),
        aPullRequest({
          id: "PR_team",
          title: "Team change",
          author: bob,
          reviewRequests: [{ kind: "team", team: "acme/web" }],
        }),
      ],
      authored: [
        aPullRequest({
          id: "PR_mine",
          title: "My change",
          author: me,
          reviewDecision: "CHANGES_REQUESTED",
        }),
      ],
    },
  });

  const review = section(screen, "Needs your review");
  await expect.element(review.getByRole("link", { name: /Please review me/ })).toBeVisible();
  await expect.element(review.getByText("elsewhere/not-a-favourite#7")).toBeVisible();
  await expect.element(review.getByText("Review requested")).toBeVisible();
  await expect.element(review.getByText("Team @acme/web")).toBeVisible();
  await expect
    // The reason chip (the review cell says it too, to screen readers).
    .element(
      section(screen, "Your pull requests · needs action").getByText("Changes requested").first(),
    )
    .toBeVisible();
  await expect
    .element(section(screen, "Your pull requests · waiting").getByText("Nothing here right now."))
    .toBeVisible();
  await expect.element(screen.getByText("3 need your action across 2 repositories")).toBeVisible();
  await expectNoAxeViolations(screen.container);
});

test("1,000+ results show the truncation notice (AC-5.7)", async () => {
  let calls = 0;
  const { screen } = await renderHome({
    searchHome: (_accountId, _login, search, after) => {
      if (search !== "authored") {
        return Promise.resolve({ ok: true, value: { data: page([]), partialErrors: [] } });
      }
      calls += 1;
      const start = after === null ? 0 : Number(after);
      const prs = Array.from({ length: 20 }, (_, i) =>
        aPullRequest({ id: `PR_${start + i}`, number: start + i + 1, author: me }),
      );
      return Promise.resolve({
        ok: true,
        value: {
          data: { pullRequests: prs, nextCursor: String(start + 20), totalCount: 1500 },
          partialErrors: [],
        },
      });
    },
  });

  await expect.element(screen.getByText(/matched more than 1,000 pull requests/)).toBeVisible();
  expect(calls).toBe(50);
  const waiting = section(screen, "Your pull requests · waiting").getByRole("button");
  await expect.poll(() => countOf(waiting.element())).toBe("1000");
});

test('opening a PR resets its "+N new" to 0 and opens the panel route (AC-5.3, FR-5.8)', async () => {
  const fresh = aPullRequest({
    id: "PR_new",
    repository: "acme/app",
    number: 12,
    title: "Busy change",
    author: bob,
    updatedAt: "2026-10-12T00:00:00Z",
    reviewRequests: [{ kind: "user", login: "octo-me" }],
    // The row knows only its last comment: newer than the marker, so the count is asked for.
    activity: [{ kind: "comment", author: bob, createdAt: "2026-10-12T00:00:00Z" }],
  });
  const quiet = aPullRequest({
    id: "PR_quiet",
    number: 13,
    title: "Quiet change",
    author: bob,
    reviewRequests: [{ kind: "user", login: "octo-me" }],
    activity: [{ kind: "comment", author: bob, createdAt: "2026-10-05T00:00:00Z" }],
  });
  const { screen, router, clock, activityCalls } = await renderHome({
    searches: { "review-requested": [fresh, quiet] },
    seenAt: { PR_new: "2026-10-10T00:00:00Z", PR_quiet: "2026-10-10T00:00:00Z" },
    getActivitySince: (_accountId, requests) =>
      Promise.resolve({
        ok: true,
        value: {
          data: requests.map(() => [
            { kind: "comment", author: bob, createdAt: "2026-10-11T00:00:00Z" },
            { kind: "review", author: bob, createdAt: "2026-10-12T00:00:00Z" },
            // The viewer's own and a bot's never count.
            { kind: "comment", author: me, createdAt: "2026-10-12T00:00:00Z" },
            {
              kind: "comment",
              author: { login: "ci[bot]", typename: "Bot" },
              createdAt: "2026-10-12T00:00:00Z",
            },
          ]),
          partialErrors: [],
        },
      }),
  });

  await expect.element(screen.getByText("+2 new")).toBeVisible();
  // Only the row with newer activity was asked about, in one request.
  expect(activityCalls).toEqual([
    [{ repository: "acme/app", number: 12, since: "2026-10-10T00:00:00.000Z" }],
  ]);

  clock.advance(6 * 24 * 60 * 60 * 1000);
  await screen.getByRole("link", { name: /Busy change/ }).click();

  await expect.poll(() => router.state.location.pathname).toBe("/repo/acme/app/pull/12");
  router.history.back();
  await expect.element(screen.getByRole("link", { name: /Busy change/ })).toBeVisible();
  expect(screen.getByText(/new$/).elements()).toHaveLength(0);
  expect(activityCalls).toHaveLength(1);
});

test('"Open in GitHub" sets the seen marker too (FR-5.8)', async () => {
  const pr = aPullRequest({
    id: "PR_gh",
    title: "External change",
    author: bob,
    reviewRequests: [{ kind: "user", login: "octo-me" }],
    activity: [{ kind: "comment", author: bob, createdAt: "2026-10-12T00:00:00Z" }],
  });
  const { screen, clock } = await renderHome({
    searches: { "review-requested": [pr] },
    seenAt: { PR_gh: "2026-10-10T00:00:00Z" },
    getActivitySince: (_accountId, requests) =>
      Promise.resolve({
        ok: true,
        value: {
          data: requests.map(() => [
            { kind: "comment", author: bob, createdAt: "2026-10-12T00:00:00Z" },
          ]),
          partialErrors: [],
        },
      }),
  });
  await expect.element(screen.getByText("+1 new")).toBeVisible();
  clock.advance(6 * 24 * 60 * 60 * 1000);
  // Keep the browser from opening a tab; the app's click handler still runs.
  document.addEventListener("click", (event) => event.preventDefault(), {
    capture: true,
    once: true,
  });

  await screen.getByRole("link", { name: "Open in GitHub" }).click();

  await expect.element(screen.getByText("+1 new")).not.toBeInTheDocument();
});

test.each(["comfortable", "compact"] as const)(
  "sections collapse, rows use the %s density, and the filter bar filters them",
  async (density) => {
    const { screen } = await renderHome({
      density,
      searches: {
        "review-requested": [
          aPullRequest({
            id: "a",
            title: "Fix date picker",
            author: bob,
            reviewRequests: [{ kind: "user", login: "octo-me" }],
          }),
          aPullRequest({
            id: "b",
            number: 2,
            title: "Docs",
            author: bob,
            reviewRequests: [{ kind: "user", login: "octo-me" }],
          }),
        ],
      },
    });
    const review = section(screen, "Needs your review");
    const toggle = review.getByRole("button", { name: /Needs your review/ });
    await expect.element(toggle).toHaveAttribute("aria-expanded", "true");
    expect(document.querySelector(".pr-row")?.getAttribute("data-density")).toBe(density);

    await screen.getByRole("searchbox", { name: "Filter pull requests" }).fill("date");
    await expect.poll(() => countOf(toggle.element())).toBe("1");
    await expect.element(review.getByRole("link", { name: /Docs/ })).not.toBeInTheDocument();

    await toggle.click();
    await expect.element(toggle).toHaveAttribute("aria-expanded", "false");
    await expect
      .element(review.getByRole("link", { name: /Fix date picker/ }))
      .not.toBeInTheDocument();
    await expectNoAxeViolations(screen.container);
  },
);

test("a failed search says so instead of showing empty sections", async () => {
  const { screen } = await renderHome({
    searchHome: () => Promise.resolve({ ok: false, error: { kind: "network" } }),
  });

  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("GitHub did not return your pull requests. Try Refresh.");
});

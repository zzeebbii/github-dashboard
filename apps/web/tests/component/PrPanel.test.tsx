import { afterEach, beforeAll, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import type {
  GitHubError,
  GitHubReadPort,
  GitHubResult,
  RepoPullRequestPage,
} from "../../src/application/github.ts";
import type { PreferencesStore } from "../../src/application/preferences.ts";
import { createSeenMarkers } from "../../src/application/seen.ts";
import { type Account, toAccountId } from "../../src/domain/account.ts";
import type {
  CheckRun,
  PullRequestDetail,
  ReviewThread,
  TimelineItem,
} from "../../src/domain/pr-detail.ts";
import type { PullRequest } from "../../src/domain/pull-request.ts";
import styles from "../../src/styles.css?inline";
import { expectNoAxeViolations } from "../axe.ts";
import { createInMemoryAccountStore } from "../fakes/in-memory-account-store.ts";
import { createInMemoryAuth } from "../fakes/in-memory-auth.ts";
import { inMemoryCache } from "../fakes/in-memory-cache.ts";
import { createInMemoryPreferencesStore } from "../fakes/in-memory-preferences-store.ts";
import { createInMemoryGitHub } from "../fakes/in-memory-github.ts";
import { aPullRequest } from "../fakes/pull-request.ts";
import { renderApp } from "../render.tsx";
import { guardAgainstTokenLeaks } from "../token-leak-guard.ts";

const TOKEN = "github_pat_FAKE_pr_panel_fixture_token";
guardAgainstTokenLeaks([TOKEN]);

const ACCOUNT: Account = {
  id: toAccountId(1000001)!,
  login: "octo-me",
  avatarUrl: "",
  tokenType: "fine-grained",
  scopes: [],
  rememberMe: false,
};
const alice = { login: "alice", typename: "User" };
const bot = { login: "ci-helper[bot]", typename: "Bot" };
const UPDATED = "2026-10-10T00:00:00Z";
const SHA = "a".repeat(40);
const PATH = "/repo/acme/app/pull/5";

beforeAll(() => {
  const sheet = document.createElement("style");
  sheet.textContent = styles;
  document.head.append(sheet);
});

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

const ROW = aPullRequest({
  id: "PR_5",
  number: 5,
  title: "Add the panel",
  updatedAt: UPDATED,
  headSha: SHA,
  // So Home lists it under "Needs your review".
  reviewRequests: [{ kind: "user", login: "octo-me" }],
});
const OTHER = aPullRequest({ id: "PR_6", number: 6, title: "Another change" });

const comment = (id: string, at: string, author = alice, bodyHTML = "<p>Looks good</p>") =>
  ({
    kind: "comment",
    id,
    url: `https://github.com/acme/app/pull/5#${id}`,
    author,
    createdAt: at,
    bodyHTML,
  }) as const satisfies TimelineItem;

const thread = (id: string, isResolved: boolean, body: string): ReviewThread => ({
  id,
  isResolved,
  isOutdated: false,
  path: "src/panel.ts",
  line: 12,
  comments: [
    {
      id: `${id}-c`,
      url: "",
      author: alice,
      createdAt: "2026-10-03T00:00:00Z",
      bodyHTML: `<p>${body}</p>`,
      diffHunk: "@@ -1,2 +1,2 @@\n context\n-old line\n+new line",
    },
  ],
});

/** Hostile on purpose: SafeHtml must render it inert (AC-6.3). */
const HOSTILE =
  '<p>Body text</p><script>window.__pwned = 1</script><img src="x" onerror="window.__pwned = 2"><a href="javascript:window.__pwned = 3">click</a><pre><code>const x = 1;</code></pre>';

const DETAIL: PullRequestDetail = {
  id: "PR_5",
  number: 5,
  title: "Add the panel",
  url: "https://github.com/acme/app/pull/5",
  state: "OPEN",
  isDraft: false,
  bodyHTML: HOSTILE,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: UPDATED,
  headSha: SHA,
  headRef: "feat/panel",
  baseRef: "main",
  mergeable: "MERGEABLE",
  mergeStateStatus: "BEHIND",
  author: alice,
  labels: [{ name: "ui", color: "ededed" }],
  assignees: ["alice"],
  milestone: "v1",
  reviewRequests: [{ kind: "team", team: "acme/web" }],
  reviews: [{ author: { login: "bob", typename: "User" }, state: "APPROVED" }],
  reviewThreads: [thread("T_open", false, "Rename this"), thread("T_done", true, "Fixed typo")],
};

const TIMELINE: TimelineItem[] = [
  comment("C_human", "2026-10-02T00:00:00Z"),
  comment("C_bot", "2026-10-04T00:00:00Z", bot, "<p>Coverage report</p>"),
];

const RUNS: CheckRun[] = [
  {
    name: "build",
    app: "GitHub Actions",
    status: "COMPLETED",
    conclusion: "FAILURE",
    startedAt: "2026-10-10T00:00:00Z",
    completedAt: "2026-10-10T00:02:05Z",
    detailsUrl: "https://github.com/acme/app/actions/runs/1",
    title: "1 error",
    summary: "Type check failed",
    isRequired: true,
    annotations: [
      {
        path: "src/panel.ts",
        startLine: 3,
        endLine: 3,
        level: "FAILURE",
        title: null,
        message: "Unexpected any",
      },
    ],
  },
  {
    name: "lint",
    app: "GitHub Actions",
    status: "COMPLETED",
    conclusion: "SUCCESS",
    startedAt: "2026-10-10T00:00:00Z",
    completedAt: "2026-10-10T00:00:40Z",
    detailsUrl: null,
    title: null,
    summary: null,
    annotations: [],
  },
];

const ok = <T,>(data: T): Promise<GitHubResult<T>> =>
  Promise.resolve({ ok: true, value: { data, partialErrors: [] } });

const repoPage = (pullRequests: readonly PullRequest[]): RepoPullRequestPage => ({
  repository: {
    id: "R_app",
    nameWithOwner: "acme/app",
    visibility: "PUBLIC",
    description: null,
    url: "https://github.com/acme/app",
  },
  page: { pullRequests, nextCursor: null, totalCount: pullRequests.length },
});

interface Setup {
  readonly path?: string;
  readonly rows?: readonly PullRequest[];
  readonly listRepoPullRequests?: GitHubReadPort["listRepoPullRequests"];
  readonly detailError?: GitHubError;
  readonly preferencesStore?: PreferencesStore;
}

async function renderPanel(options: Setup = {}) {
  const accountStore = createInMemoryAccountStore();
  const auth = createInMemoryAuth(accountStore, {
    [TOKEN]: { account: ACCOUNT, missingPermissions: [], ssoAuthorizationNeeded: false },
  });
  await auth.signIn({ token: TOKEN, rememberMe: false });
  const calls: string[] = [];
  const rows = options.rows ?? [ROW, OTHER];
  const github = createInMemoryGitHub(undefined, {
    listRepoPullRequests: (...args) => {
      calls.push("list");
      return options.listRepoPullRequests?.(...args) ?? ok(repoPage(rows));
    },
    searchHome: (_accountId, _login, search) => {
      calls.push(`search ${search}`);
      const prs = search === "review-requested" ? rows : [];
      return ok({ pullRequests: prs, nextCursor: null, totalCount: prs.length });
    },
    getPullRequest: () => {
      calls.push("detail");
      if (options.detailError !== undefined) {
        return Promise.resolve({ ok: false, error: options.detailError });
      }
      return ok({ pullRequest: DETAIL, timeline: { items: TIMELINE, nextCursor: "next" } });
    },
    getTimelinePage: () => {
      calls.push("timeline");
      return ok({ items: [comment("C_later", "2026-10-09T00:00:00Z")], nextCursor: null });
    },
    getCheckRuns: () => {
      calls.push("checks");
      return ok(RUNS);
    },
  });
  const cache = inMemoryCache({ now: () => new Date() });
  const seen = createSeenMarkers(cache);
  const app = await renderApp(options.path ?? "/repo/acme/app", {
    accountStore,
    auth,
    hasToken: auth.hasToken,
    github,
    seen,
    ...(options.preferencesStore === undefined
      ? {}
      : { preferencesStore: options.preferencesStore }),
  });
  return { ...app, calls, seen };
}

type Screen = Awaited<ReturnType<typeof renderPanel>>["screen"];
const dialog = (screen: Screen) => screen.getByRole("dialog", { name: /Add the panel/ });
const rowLink = () => document.querySelector<HTMLElement>(`a.pr-title[href="${PATH}"]`);

test("Enter opens the panel, Tab stays inside, Esc closes and focus returns to the row (AC-6.4)", async () => {
  const { screen, router } = await renderPanel({ path: "/repo/acme/app?tab=review&q=panel" });
  await expect.poll(rowLink).not.toBeNull();
  rowLink()?.focus();

  await userEvent.keyboard("{Enter}");

  const panel = dialog(screen);
  await expect.element(panel).toBeVisible();
  await expect.element(panel.getByRole("heading", { level: 2 })).toHaveFocus();
  expect(router.state.location.pathname).toBe(PATH);
  // The list underneath keeps its tab and filter.
  expect(router.state.location.search).toEqual({ tab: "review", q: "panel" });
  await expectNoAxeViolations(screen.container);

  const element = panel.element();
  for (let i = 0; i < 25; i += 1) {
    // oxlint-disable-next-line no-await-in-loop -- reason: one key press at a time, in order
    await userEvent.keyboard(i % 5 === 4 ? "{Shift>}{Tab}{/Shift}" : "{Tab}");
    expect({ press: i + 1, inside: element.contains(document.activeElement) }).toEqual({
      press: i + 1,
      inside: true,
    });
  }

  await userEvent.keyboard("{Escape}");

  await expect.element(panel).not.toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/repo/acme/app");
  expect(router.state.location.search).toEqual({ tab: "review", q: "panel" });
  await expect.poll(() => document.activeElement).toBe(rowLink());
});

test("over Home: the list stays underneath, close returns focus to the row, Back closes it too", async () => {
  const { screen, router, calls } = await renderPanel({ path: "/" });
  await expect.poll(rowLink).not.toBeNull();

  await screen.getByRole("link", { name: /Add the panel/ }).click();

  const panel = dialog(screen);
  await expect.element(panel).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Pull requests" }))
    .toBeInTheDocument();
  expect(router.history.location.pathname).toBe(PATH);
  // No repository page underneath, so no repository list request.
  expect(calls).not.toContain("list");

  await panel.getByRole("button", { name: "Close" }).click();

  await expect.element(panel).not.toBeInTheDocument();
  expect(router.history.location.pathname).toBe("/");
  await expect.poll(() => document.activeElement).toBe(rowLink());

  await screen.getByRole("link", { name: /Add the panel/ }).click();
  await expect.element(dialog(screen)).toBeVisible();
  router.history.back();
  await expect.element(dialog(screen)).not.toBeInTheDocument();
  await expect.poll(() => document.activeElement).toBe(rowLink());
});

test("Unresolved shows only unresolved threads; Humans hides bots; bots start collapsed (AC-6.6)", async () => {
  const { screen } = await renderPanel({ path: PATH });
  const panel = dialog(screen);
  await expect.element(panel.getByText("Rename this")).toBeVisible();
  // The bot's comment is grouped and collapsed by default.
  await expect.element(panel.getByText("ci-helper[bot]").first()).toBeVisible();
  await expect.element(panel.getByText("Coverage report")).not.toBeVisible();
  // A resolved thread starts collapsed.
  await expect.element(panel.getByText("Fixed typo")).not.toBeVisible();

  await panel.getByRole("button", { name: "Unresolved" }).click();
  await expect.element(panel.getByText("Rename this")).toBeVisible();
  await expect.element(panel.getByText("Fixed typo")).not.toBeInTheDocument();
  await expect.element(panel.getByText("Looks good")).not.toBeInTheDocument();
  await expect.element(panel.getByText("Body text")).not.toBeInTheDocument();

  await panel.getByRole("button", { name: "Humans only" }).click();
  await expect.element(panel.getByText("Looks good")).toBeVisible();
  await expect.element(panel.getByText("ci-helper[bot]")).not.toBeInTheDocument();
  await expect
    .element(panel.getByRole("button", { name: "Humans only" }))
    .toHaveAttribute("aria-pressed", "true");
});

test("no approve, comment, merge or re-run control exists in any tab (FR-6.9)", async () => {
  const { screen } = await renderPanel({ path: PATH });
  const panel = dialog(screen);
  await expect.element(panel.getByText("Rename this")).toBeVisible();
  const forbidden = /\b(approve|merge|re-?run|comment|resolve|unresolve)\b/i;
  for (const tab of ["Conversation", "Checks", "Details"]) {
    // oxlint-disable-next-line no-await-in-loop -- reason: one tab after another
    await panel.getByRole("tab", { name: new RegExp(`^${tab}`) }).click();
    const controls = [
      ...panel.element().querySelectorAll<HTMLElement>("button, a, [role=button], input"),
    ];
    const names = controls.map((c) => c.getAttribute("aria-label") ?? c.textContent);
    expect({ tab, names: names.filter((name) => forbidden.test(name)) }).toEqual({
      tab,
      names: [],
    });
  }
});

test.each(["Conversation", "Checks", "Details"])(
  "the %s tab passes axe in both themes",
  async (tab) => {
    const { screen } = await renderPanel({ path: PATH });
    const panel = dialog(screen);
    await expect.element(panel.getByText("Rename this")).toBeVisible();
    await panel.getByRole("tab", { name: new RegExp(`^${tab}`) }).click();
    await expect
      .element(panel.getByRole("tab", { name: new RegExp(`^${tab}`) }))
      .toHaveAttribute("aria-selected", "true");
    // Open every collapsed part, so axe sees it too.
    for (const details of panel.element().querySelectorAll("details")) details.open = true;
    await expectNoAxeViolations(screen.container);
  },
);

test("the Checks tab lists runs with status, duration, required flag, output and annotations", async () => {
  const { screen } = await renderPanel({ path: PATH });
  const panel = dialog(screen);
  await panel.getByRole("tab", { name: /^Checks/ }).click();

  await expect.element(panel.getByText("1 failing")).toBeVisible();
  await expect.element(panel.getByText("GitHub Actions · Failed after 2m 5s")).toBeVisible();
  await expect.element(panel.getByText("Required")).toBeVisible();
  await expect.element(panel.getByText("Type check failed")).toBeVisible();
  await expect.element(panel.getByText("Unexpected any")).toBeVisible();
  await expect
    .element(panel.getByRole("link", { name: "Logs for build (opens in a new tab)" }))
    .toHaveAttribute("href", "https://github.com/acme/app/actions/runs/1");
});

test("the Details tab shows GitHub's exact merge state, reviewers and facts", async () => {
  const { screen } = await renderPanel({ path: PATH });
  const panel = dialog(screen);
  await panel.getByRole("tab", { name: /^Details/ }).click();

  await expect.element(panel.getByText("Behind the base branch")).toBeVisible();
  await expect.element(panel.getByText("bob")).toBeVisible();
  await expect.element(panel.getByText("@acme/web")).toBeVisible();
  await expect.element(panel.getByText("Pending")).toBeVisible();
  await expect.element(panel.getByText("v1")).toBeVisible();
});

test("a deep link with no list row costs 2 requests; reopening it unchanged costs 0 (AC-6.1)", async () => {
  // The repository list never answers: the panel cannot wait for a row.
  const { screen, calls, seen, router } = await renderPanel({
    path: PATH,
    listRepoPullRequests: () => new Promise(() => undefined),
  });
  const panel = dialog(screen);
  await expect.element(panel.getByText("Body text")).toBeVisible();
  // Focus stayed on the heading while the panel loaded (FR-6.7).
  await expect.element(panel.getByRole("heading", { level: 2 })).toHaveFocus();
  await expect.poll(() => calls.filter((c) => c === "detail" || c === "checks").length).toBe(2);
  expect(calls.toSorted()).toEqual(["checks", "detail", "list"]);
  // Opening it, even by a direct URL, sets the seen marker (FR-6.8).
  await expect.poll(async () => Object.keys(await seen.getSeen(ACCOUNT.id))).toEqual(["PR_5"]);

  // No history to go Back to: closing goes to the repository page.
  await panel.getByRole("button", { name: "Close" }).click();
  expect(router.state.location.pathname).toBe("/repo/acme/app");
  // Deep link without a row: focus falls back to main.
  await expect.poll(() => document.activeElement?.id).toBe("main");

  await router.navigate({
    to: "/repo/$owner/$name/pull/$number",
    params: { owner: "acme", name: "app", number: "5" },
  });
  await expect.element(dialog(screen).getByText("Body text")).toBeVisible();
  // The lookup without a row asks again (it cannot know the PR is unchanged); the checks
  // of that head SHA are complete and cached.
  expect(calls.filter((c) => c === "detail" || c === "checks")).toEqual([
    "detail",
    "checks",
    "detail",
  ]);
});

test("opened from a row, an unchanged PR reopens from the cache with 0 requests", async () => {
  const { screen, calls } = await renderPanel();
  await screen.getByRole("link", { name: /Add the panel/ }).click();
  await expect.element(dialog(screen).getByText("Body text")).toBeVisible();
  await expect.poll(() => calls.filter((c) => c === "checks").length).toBe(1);
  await userEvent.keyboard("{Escape}");
  await expect.element(dialog(screen)).not.toBeInTheDocument();
  const before = calls.length;

  await screen.getByRole("link", { name: /Add the panel/ }).click();

  await expect.element(dialog(screen).getByText("Body text")).toBeVisible();
  expect(calls.slice(before)).toEqual([]);
});

test("GitHub HTML goes through SafeHtml: a hostile body renders inert (AC-6.3)", async () => {
  const { screen } = await renderPanel({ path: PATH });
  const panel = dialog(screen);
  await expect.element(panel.getByText("Body text")).toBeVisible();
  const element = panel.element();

  expect(element.querySelector("script")).toBeNull();
  expect(element.querySelector("[onerror]")).toBeNull();
  expect(element.querySelector('a[href^="javascript:"]')).toBeNull();
  expect(element.querySelector("img")).toBeNull();
  // Images become a labelled link, code stays code.
  await expect.element(panel.getByText("const x = 1;")).toBeVisible();
  expect(Reflect.get(window, "__pwned")).toBeUndefined();
});

test("Load more fetches the next timeline page (AC-6.5)", async () => {
  const { screen, calls } = await renderPanel({ path: PATH });
  const panel = dialog(screen);
  await expect.element(panel.getByText("Looks good")).toBeVisible();
  await panel.getByRole("button", { name: "Load more" }).click();
  await expect.poll(() => panel.getByText("Looks good").elements().length).toBe(2);
  expect(calls.filter((c) => c === "timeline")).toEqual(["timeline"]);
  await expect.element(panel.getByRole("button", { name: "Load more" })).not.toBeInTheDocument();
});

test.each([
  [{ kind: "notFound" }, "This pull request does not exist, or this account cannot see it."],
  [{ kind: "network" }, "Could not reach GitHub. Check your connection and try again."],
  [
    { kind: "rateLimited", resetAt: new Date("2026-10-16T12:00:00Z") },
    "GitHub's rate limit was reached. Wait a few minutes and try again.",
  ],
  [{ kind: "schema", detail: "x" }, "GitHub did not return this pull request. Try again later."],
] satisfies [GitHubError, string][])(
  "a %o error shows its message in the panel",
  async (error, text) => {
    const { screen } = await renderPanel({ path: PATH, rows: [], detailError: error });
    const panel = screen.getByRole("dialog", { name: "Pull request #5" });
    await expect.element(panel.getByRole("alert")).toHaveTextContent(text);
    await expect.element(panel.getByRole("button", { name: "Close" })).toBeVisible();
  },
);

test("no access names the organisation and links to the fix", async () => {
  const { screen } = await renderPanel({
    path: PATH,
    rows: [],
    detailError: {
      kind: "orgAccess",
      issue: { org: "acme", reason: "sso", fixUrl: "https://github.com/orgs/acme/sso" },
    },
  });
  const panel = screen.getByRole("dialog", { name: "Pull request #5" });
  await expect
    .element(panel.getByText("GitHub refused this account access to this pull request."))
    .toBeVisible();
  await expect
    .element(panel.getByRole("link", { name: "Fix access to acme (opens in a new tab)" }))
    .toHaveAttribute("href", "https://github.com/orgs/acme/sso");
  await expectNoAxeViolations(screen.container);
});

// layout: the panel's width and its reading measure.
const panelWidth = (screen: Screen) =>
  Math.round(dialog(screen).element().getBoundingClientRect().width);

test("the panel opens at min(1040px, 72vw) and its left edge resizes it, saved for next time", async () => {
  await page.viewport(1280, 800);
  const store = createInMemoryPreferencesStore();
  const { screen } = await renderPanel({ path: PATH, preferencesStore: store });
  const panel = dialog(screen);
  await expect.element(panel).toBeVisible();
  // 72% of 1280 px.
  expect(panelWidth(screen)).toBe(922);
  const splitter = panel.getByRole("separator", { name: "Resize pull request panel" });
  await expect.element(splitter).toHaveAttribute("aria-valuenow", "922");
  await expect.element(splitter).toHaveAttribute("aria-valuemin", "480");
  await expect.element(splitter).toHaveAttribute("aria-valuemax", "1216");

  splitter.element().focus();
  // On the left edge, ArrowLeft widens.
  await userEvent.keyboard("{Shift>}{ArrowLeft}{/Shift}");

  await expect.element(splitter).toHaveAttribute("aria-valuenow", "986");
  expect(panelWidth(screen)).toBe(986);
  expect(store.load().prPanelWidth).toBe(986);
  await expectNoAxeViolations(screen.container);

  await userEvent.keyboard("{End}");
  await expect.element(splitter).toHaveAttribute("aria-valuenow", "1216");
  await screen.unmount();

  const again = await renderPanel({ path: PATH, preferencesStore: store });
  await expect.element(dialog(again.screen)).toBeVisible();
  expect(panelWidth(again.screen)).toBe(1216);
});

test("J, K and arrows on the panel's splitter keep focus there and leave the page alone", async () => {
  await page.viewport(1280, 800);
  const { screen, router } = await renderPanel({ path: PATH });
  const splitter = dialog(screen).getByRole("separator", { name: "Resize pull request panel" });
  splitter.element().focus();

  await userEvent.keyboard("jk{ArrowDown}{ArrowUp}");

  await expect.element(splitter).toHaveFocus();
  expect(router.state.location.pathname).toBe(PATH);
});

test("comment bodies keep a reading measure in a wide panel", async () => {
  await page.viewport(1920, 1000);
  const { screen } = await renderPanel({ path: PATH });
  const panel = dialog(screen);
  await expect.element(panel.getByText("Looks good")).toBeVisible();
  const body = panel.getByText("Looks good").element().closest(".pp-body > div");
  const card = body?.closest(".pp-card");
  expect(body).toBeInstanceOf(HTMLElement);
  expect(card).toBeInstanceOf(HTMLElement);
  const bodyWidth = body?.getBoundingClientRect().width ?? 0;
  const measure = Number.parseFloat(getComputedStyle(body ?? document.body).maxWidth);
  // 80ch, not the whole card.
  expect(bodyWidth).toBeCloseTo(measure, 0);
  expect(bodyWidth).toBeLessThan((card?.getBoundingClientRect().width ?? 0) - 100);
  // The panel itself uses the room, and nothing scrolls sideways.
  const content = panel.element().querySelector(".pp-content");
  expect(content?.scrollWidth).toBe(content?.clientWidth);
});

test("below 768 px the panel is full width, with no splitter", async () => {
  await page.viewport(375, 800);
  const { screen } = await renderPanel({ path: PATH });
  await expect.element(dialog(screen)).toBeVisible();

  expect(panelWidth(screen)).toBe(375);
  await expect
    .element(dialog(screen).getByRole("separator", { includeHidden: true }))
    .not.toBeVisible();
  await page.viewport(1280, 800);
});

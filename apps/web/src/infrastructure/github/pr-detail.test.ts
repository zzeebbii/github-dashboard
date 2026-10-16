import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import { HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInMemoryAccountStore } from "../../../tests/fakes/in-memory-account-store.ts";
import { createInMemoryAuth } from "../../../tests/fakes/in-memory-auth.ts";
import { inMemoryCache } from "../../../tests/fakes/in-memory-cache.ts";
import checksFixture from "../../../tests/fixtures/github/graphql-pr-checks.json";
import detailFixture from "../../../tests/fixtures/github/graphql-pr-detail.json";
import { GRAPHQL_URL, setupGitHubServer } from "../../../tests/msw/github.ts";
import { everythingAbout, guardAgainstTokenLeaks } from "../../../tests/token-leak-guard.ts";
import {
  GitHubQueryError,
  type PrDetailInput,
  checkRunsQueryOptions,
  prDetailQueryOptions,
} from "../../application/pr/use-pr-detail.ts";
import { hydrateQueries, persistQueries } from "../../application/query-hydration.ts";
import { toAccountId } from "../../domain/account.ts";
import type { Account } from "../../domain/account.ts";
import type { CheckRun } from "../../domain/pr-detail.ts";
import { createGitHubClient } from "./client.ts";
import { createGitHubRead } from "./github-read.ts";
import { createRateLimitTracker } from "./rate-limit.ts";

// Obviously fake, shaped so secret scanners do not match it.
const TOKEN = "github_pat_FAKE_fixture_token_for_tests_only";
const ACCOUNT: Account = {
  id: toAccountId(1000001)!,
  login: "octo-fixture",
  avatarUrl: "https://avatars.githubusercontent.com/u/1000001?v=4",
  tokenType: "fine-grained",
  scopes: [],
  rememberMe: false,
};
const REF = { owner: "vitejs", name: "vite", number: 22559 } as const;
const HEAD_SHA = "02638e926b6877b21c2c991f575ea7a81ac05c44";
// What the list row the user opened says (T16/T20).
const INPUT: PrDetailInput = {
  accountId: ACCOUNT.id,
  ref: REF,
  updatedAt: "2026-09-05T02:43:29Z",
  headSha: HEAD_SHA,
};

const github = setupGitHubServer();
guardAgainstTokenLeaks([TOKEN]);
afterEach(() => vi.useRealTimers());

type Body = { query: string; variables: Record<string, unknown> };
const clone = <T>(value: T): T => structuredClone(value);
const reply = (fixture: { status: number; headers: Record<string, string>; body: unknown }) =>
  new HttpResponse(JSON.stringify(fixture.body), {
    status: fixture.status,
    headers: fixture.headers,
  });

/** Answers each document with its own fixture, and records the variables sent. */
function serve({
  detail = detailFixture,
  checks = checksFixture.body,
  timeline,
}: {
  detail?: typeof detailFixture;
  checks?: unknown;
  timeline?: (after: string) => unknown;
} = {}) {
  const sent: Body[] = [];
  github.graphql(async (request) => {
    const body = (await request.json()) as Body;
    sent.push(body);
    if (body.query.startsWith("query PullRequestChecks")) {
      return reply({ ...checksFixture, body: checks });
    }
    if (body.query.startsWith("query PullRequestTimeline") && timeline !== undefined) {
      return reply({ ...detailFixture, body: timeline(String(body.variables["after"])) });
    }
    return reply(detail);
  });
  return sent;
}

async function setup() {
  const auth = createInMemoryAuth(createInMemoryAccountStore(), {
    [TOKEN]: { account: ACCOUNT, missingPermissions: [], ssoAuthorizationNeeded: false },
  });
  await auth.signIn({ token: TOKEN, rememberMe: false });
  const clock = { now: () => new Date() };
  const cache = inMemoryCache(clock);
  const client = createGitHubClient({
    auth,
    tracker: createRateLimitTracker(clock, null),
    cache,
    clock,
    onUnauthorized: () => undefined,
  });
  return { read: createGitHubRead(client), cache };
}

/** Requests and points spent since `before` (an earlier `budget()`). */
async function spentSince(before: { requests: number; graphqlCost: number }) {
  const now = await github.budget();
  return {
    requests: now.requests - before.requests,
    graphqlCost: now.graphqlCost - before.graphqlCost,
  };
}

function queryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/** What opening the panel does: the detail and the check runs, in parallel. */
async function open(client: QueryClient, read: ReturnType<typeof createGitHubRead>, input = INPUT) {
  const [detail, checks] = await Promise.all([
    client.fetchInfiniteQuery(prDetailQueryOptions(read, input)),
    client.fetchQuery(checkRunsQueryOptions(read, input)),
  ]);
  return { detail, checks };
}

/** n timeline comments, numbered from `from`. */
const comments = (from: number, n: number) =>
  Array.from({ length: n }, (_, i) => ({
    __typename: "IssueComment",
    id: `IC_${from + i}`,
    url: `https://github.com/vitejs/vite/pull/22559#issuecomment-${from + i}`,
    createdAt: "2026-08-02T07:53:49Z",
    bodyHTML: "<p>Fixture text.</p>",
    author: { __typename: "User", login: "octo-commenter" },
  }));
const timelineOf = (from: number, n: number, next: string | null) => ({
  pageInfo: { hasNextPage: next !== null, endCursor: next },
  nodes: comments(from, n),
});

function withPendingRun() {
  const checks = clone(checksFixture.body);
  const run = checks.data.repository.object.checkSuites.nodes[0]?.checkRuns.nodes[0];
  if (run === undefined) throw new Error("fixture has no runs");
  Object.assign(run, { status: "IN_PROGRESS", conclusion: null, completedAt: null });
  return checks;
}

describe("PR detail budget (AC-3.1, AC-6.1, ADR-0017)", () => {
  it("an uncached open makes at most 2 GraphQL requests, no REST, within 2 points", async () => {
    const sent = serve();
    const { read } = await setup();

    await open(queryClient(), read);

    expect(github.requests.every((r) => r.method === "POST" && r.url === GRAPHQL_URL)).toBe(true);
    expect(await github.budget()).toEqual({ requests: 2, graphqlCost: 2 });
    // Only the declared variables are sent.
    expect(sent.map((b) => b.variables)).toEqual(
      expect.arrayContaining([
        { ...REF, after: null },
        { ...REF, sha: HEAD_SHA },
      ]),
    );
  });

  it("a cached, unchanged open makes 0 requests, also after a reload", async () => {
    serve();
    const { read, cache } = await setup();
    const first = queryClient();
    persistQueries(first, cache);
    await open(first, read);
    const before = await github.budget();

    // Same tab: the in-memory query is fresh forever under this key.
    await open(first, read);
    // A reload: a new query client, restored from IndexedDB.
    const reloaded = queryClient();
    await hydrateQueries(reloaded, cache, ACCOUNT.id, { timeoutMs: 300 });
    const { detail, checks } = await open(reloaded, read);

    expect(await spentSince(before)).toEqual({ requests: 0, graphqlCost: 0 });
    expect(detail.pages[0]?.pullRequest?.title).toBe(
      "fix(serve): serve index.html from public subdirectories",
    );
    expect(checks.length).toBeGreaterThan(0);
  });

  it("a PR whose updatedAt changed is fetched again; its finished checks are not", async () => {
    serve();
    const { read } = await setup();
    const client = queryClient();
    await open(client, read);
    const before = await github.budget();

    await open(client, read, { ...INPUT, updatedAt: "2026-10-01T00:00:00Z" });

    expect(await spentSince(before)).toEqual({ requests: 1, graphqlCost: 1 });
  });
});

describe("check run polling (FR-6.5, AC-6.2)", () => {
  it("refetches a running check at most every 60 s, and never once all completed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-16T06:00:00Z"));
    serve({ checks: withPendingRun() });
    const { read } = await setup();
    const client = queryClient();
    const options = checkRunsQueryOptions(read, INPUT);
    await client.fetchQuery(options);
    const query = client
      .getQueryCache()
      .find<readonly CheckRun[], GitHubQueryError>({ queryKey: options.queryKey });
    const interval = options.refetchInterval;
    if (query === undefined || typeof interval !== "function") throw new Error("no query");
    expect(interval(query)).toBe(60_000);

    vi.setSystemTime(new Date("2026-10-16T06:00:59Z"));
    await client.fetchQuery(options);
    expect(github.requests).toHaveLength(1);

    serve();
    vi.setSystemTime(new Date("2026-10-16T06:01:00Z"));
    await client.fetchQuery(options);
    expect(github.requests).toHaveLength(2);

    // Now every run has completed: no interval, and never stale again.
    expect(interval(query)).toBe(false);
    vi.setSystemTime(new Date("2026-10-17T06:00:00Z"));
    await client.fetchQuery(options);
    expect(github.requests).toHaveLength(2);
  });

  it("maps runs with their app, required flag and failing-run annotations only", async () => {
    const checks = clone(checksFixture.body);
    const zizmor = checks.data.repository.object.checkSuites.nodes[1]?.checkRuns.nodes[0];
    if (zizmor === undefined) throw new Error("fixture has no runs");
    Object.assign(zizmor, { isRequired: null });
    serve({ checks });
    const { read } = await setup();

    const result = await read.getCheckRuns(ACCOUNT.id, REF, HEAD_SHA);

    if (!result.ok) throw new Error(result.error.kind);
    const runs = result.value.data;
    expect(runs.find((r) => r.name === "Semantic Pull Request")).toMatchObject({
      app: "GitHub Actions",
      isRequired: true,
      annotations: [],
    });
    expect(runs.find((r) => r.name === "Run zizmor")).not.toHaveProperty("isRequired");
    const failing = runs.filter((r) => r.annotations.length > 0);
    expect(failing.map((r) => [r.name, r.conclusion])).toEqual([
      ["Build&Test: node-24, macos-latest", "FAILURE"],
    ]);
    expect(failing[0]?.annotations).toEqual([
      {
        path: ".github",
        startLine: 72,
        endLine: 72,
        level: "FAILURE",
        title: null,
        message: "Process completed with exit code 1.",
      },
    ]);
  });
});

describe("PR detail data (FR-6.2)", () => {
  it("maps the header, review threads with snippet and resolved state, and the timeline", async () => {
    serve();
    const { read } = await setup();

    const result = await read.getPullRequest(ACCOUNT.id, REF);

    if (!result.ok) throw new Error(result.error.kind);
    const { pullRequest, timeline } = result.value.data;
    expect(pullRequest).toMatchObject({
      number: 22559,
      headSha: HEAD_SHA,
      baseRef: "main",
      mergeable: "MERGEABLE",
      mergeStateStatus: "BLOCKED",
      author: { login: "octo-author", typename: "User" },
      labels: [
        { name: "feat: html", color: "094d72" },
        { name: "p2-nice-to-have", color: "f4b7ff" },
      ],
      milestone: null,
      bodyHTML: '<p dir="auto">Fixture description.</p>',
    });
    expect(pullRequest.reviewThreads.map((t) => [t.path, t.line, t.isResolved])).toEqual([
      ["packages/vite/src/node/server/middlewares/static.ts", 42, false],
      ["docs/guide/assets.md", null, true],
    ]);
    expect(pullRequest.reviewThreads[0]?.comments[0]?.diffHunk).toContain("@@ -40,3 +40,4 @@");
    expect(timeline.items.map((i) => i.kind)).toEqual(["review", "review", "comment", "comment"]);
    expect(timeline.nextCursor).toBeNull();
  });

  it("loads 120 timeline items as 50, then 50 more and 20 more on load more (AC-6.5)", async () => {
    const detail = clone(detailFixture);
    detail.body.data.repository.pullRequest.timelineItems = timelineOf(0, 50, "cursor-50") as never;
    const sent = serve({
      detail,
      timeline: (after) => ({
        data: {
          repository: {
            pullRequest: {
              timelineItems:
                after === "cursor-50"
                  ? timelineOf(50, 50, "cursor-100")
                  : timelineOf(100, 20, null),
            },
          },
          rateLimit: { cost: 1, limit: 5000, remaining: 4990, resetAt: "2026-10-16T07:36:48Z" },
        },
      }),
    });
    const { read } = await setup();
    const client = queryClient();
    const options = prDetailQueryOptions(read, INPUT);
    const count = () =>
      client.getQueryData(options.queryKey)?.pages.flatMap((p) => p.timeline.items).length;

    await client.fetchInfiniteQuery(options);
    expect(count()).toBe(50);
    const before = await github.budget();

    // What the "Load more" button does.
    const observer = new InfiniteQueryObserver(client, options);
    await observer.fetchNextPage();
    expect(count()).toBe(100);
    expect(await spentSince(before)).toEqual({ requests: 1, graphqlCost: 1 });
    expect(sent.at(-1)?.variables).toEqual({ ...REF, after: "cursor-50" });
    expect(sent.at(-1)?.query.startsWith("query PullRequestTimeline")).toBe(true);

    await observer.fetchNextPage();
    const data = client.getQueryData(options.queryKey);
    expect(count()).toBe(120);
    expect(data?.pages.at(-1)?.timeline.nextCursor).toBeNull();
    expect(data?.pages.at(-1)?.timeline.items.at(-1)).toMatchObject({ id: "IC_119" });
  });
});

describe("PR detail failures", () => {
  it("a malformed response is a schema error naming the field, never its value", async () => {
    const detail = clone(detailFixture);
    detail.body.data.repository.pullRequest.headRefOid = TOKEN;
    serve({ detail });
    const { read } = await setup();

    const result = await read.getPullRequest(ACCOUNT.id, REF);

    expect(result).toMatchObject({ ok: false, error: { kind: "schema" } });
    expect(everythingAbout(result)).toContain("headRefOid");
    expect(everythingAbout(result)).not.toContain(TOKEN);
  });

  it("a query failure throws a GitHubQueryError that carries no token", async () => {
    const checks = clone(checksFixture.body);
    Object.assign(checks.data.repository.object.checkSuites.nodes[0] ?? {}, { checkRuns: 7 });
    serve({ checks });
    const { read } = await setup();

    const error: unknown = await queryClient()
      .fetchQuery(checkRunsQueryOptions(read, INPUT))
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GitHubQueryError);
    expect(error).toMatchObject({ error: { kind: "schema" } });
    expect(everythingAbout(error)).not.toContain(TOKEN);
  });

  it("a missing PR or commit is notFound", async () => {
    const missing = {
      data: { repository: null, rateLimit: detailFixture.body.data.rateLimit },
      errors: [{ type: "NOT_FOUND", path: ["repository"], message: "Could not resolve." }],
    };
    serve({ detail: { ...detailFixture, body: missing as never }, checks: missing });
    const { read } = await setup();

    expect(await read.getPullRequest(ACCOUNT.id, REF)).toEqual({
      ok: false,
      error: { kind: "notFound" },
    });
    expect(await read.getCheckRuns(ACCOUNT.id, REF, HEAD_SHA)).toEqual({
      ok: false,
      error: { kind: "notFound" },
    });
    expect(await read.getTimelinePage(ACCOUNT.id, REF, "cursor-50")).toEqual({
      ok: false,
      error: { kind: "notFound" },
    });
  });
});

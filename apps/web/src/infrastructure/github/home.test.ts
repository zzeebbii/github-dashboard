import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fakeSignal,
  inMemoryCrossTab,
  manualTime,
} from "../../../tests/fakes/fake-refresh-ports.ts";
import { createInMemoryAccountStore } from "../../../tests/fakes/in-memory-account-store.ts";
import { createInMemoryAuth } from "../../../tests/fakes/in-memory-auth.ts";
import { inMemoryCache } from "../../../tests/fakes/in-memory-cache.ts";
import favouritesFixture from "../../../tests/fixtures/github/graphql-favourites.json";
import fixture from "../../../tests/fixtures/github/graphql-home-search.json";
import { GRAPHQL_URL, setupGitHubServer } from "../../../tests/msw/github.ts";
import { guardAgainstTokenLeaks } from "../../../tests/token-leak-guard.ts";
import { HOME_SEARCHES, type HomeSearch } from "../../application/github.ts";
import {
  homeActivityQueryOptions,
  homeSearchQueryOptions,
} from "../../application/home/use-home.ts";
import {
  createQueryRefresher,
  createRefreshScheduler,
} from "../../application/refresh-scheduler.ts";
import { favouriteBatchQueryOptions } from "../../application/repos/use-favourites.ts";
import { toAccountId, type Account } from "../../domain/account.ts";
import type { PullRequest } from "../../domain/pull-request.ts";
import { createGitHubClient } from "./client.ts";
import { createGitHubRead } from "./github-read.ts";
import { createRateLimitTracker } from "./rate-limit.ts";

// Obviously fake, shaped so secret scanners do not match it.
const TOKEN = "github_pat_FAKE_fixture_token_for_tests_only";
const ACCOUNT: Account = {
  id: toAccountId(1000001)!,
  login: "octo-user-10",
  avatarUrl: "https://avatars.githubusercontent.com/u/1000001?v=4",
  tokenType: "fine-grained",
  scopes: [],
  rememberMe: false,
};

const github = setupGitHubServer();
guardAgainstTokenLeaks([TOKEN]);
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

const recorded = fixture.body.data.search.nodes;
const QUERY_OF: Record<HomeSearch, string> = {
  "review-requested": "is:pr is:open review-requested:@me",
  authored: "is:pr is:open author:@me",
  "reviewed-by": "is:pr is:open reviewed-by:@me -author:@me",
};

const reply = (body: unknown) =>
  new HttpResponse(JSON.stringify(body), { status: fixture.status, headers: fixture.headers });
const rateLimit = fixture.body.data.rateLimit;

/** Row `i` of a search: a recorded row under a per-search id; base searches lack re-review fields. */
function row(search: HomeSearch, i: number, rereview: boolean) {
  const { commits, lastRequest, ...base } = structuredClone(recorded[i % recorded.length]!);
  // The recording predates the document's node-level `__typename`.
  const node = { __typename: "PullRequest", ...base, id: `PR_${search}_${i}` };
  return rereview ? { ...node, commits, lastRequest } : node;
}

interface Asked {
  readonly searches: { readonly search: HomeSearch; readonly after: string | null }[];
  readonly activity: number[];
}

/**
 * Serves Home's searches with `sizes[search]` matches, 20 per page, and the activity-since
 * document with one comment per used slot. Records what was asked.
 */
function serveHome(sizes: Record<HomeSearch, number>): Asked {
  const asked: Asked = { searches: [], activity: [] };
  github.graphql(async (request) => {
    const { query, variables } = (await request.json()) as {
      query: string;
      variables: Record<string, unknown>;
    };
    if (query.startsWith("query HomeSearch")) {
      const search = HOME_SEARCHES.find((s) => QUERY_OF[s] === variables["q"]);
      if (search === undefined) throw new Error("unexpected search string");
      const after = typeof variables["after"] === "string" ? variables["after"] : null;
      asked.searches.push({ search, after });
      const start = after === null ? 0 : Number(after.slice("page:".length));
      const size = sizes[search];
      const end = Math.min(start + 20, size);
      const rereview = query.includes("lastRequest:");
      return reply({
        data: {
          search: {
            // GitHub counts every match but returns at most 1,000.
            issueCount: size,
            pageInfo: {
              hasNextPage: end < Math.min(size, 1000),
              endCursor: end < size ? `page:${end}` : null,
            },
            nodes: Array.from({ length: end - start }, (_, k) => row(search, start + k, rereview)),
          },
          rateLimit,
        },
      });
    }
    if (query.startsWith("query ActivitySince")) {
      const used = Array.from({ length: 10 }, (_, i) => i).filter((i) => variables[`use${i}`]);
      asked.activity.push(used.length);
      const data = Object.fromEntries(
        used.map((i) => [
          `a${i}`,
          {
            pullRequest: {
              id: `slot-${i}`,
              timelineItems: {
                nodes: [
                  {
                    __typename: "IssueComment",
                    createdAt: "2026-10-16T05:00:00Z",
                    author: { __typename: "User", login: "octo-user-1" },
                  },
                ],
              },
            },
          },
        ]),
      );
      return reply({ data: { ...data, rateLimit } });
    }
    if (query.startsWith("query Favourites")) {
      const ids = (variables["ids"] as string[] | undefined) ?? [];
      const nodes = ids.map((id, i) =>
        Object.assign(structuredClone(favouritesFixture.body.data.nodes[i % 25] ?? {}), { id }),
      );
      return reply({ data: { nodes, rateLimit } });
    }
    throw new Error(`unexpected document: ${query.slice(0, 40)}`);
  });
  return asked;
}

async function setup(clock: { now(): Date } = { now: () => new Date() }) {
  const auth = createInMemoryAuth(createInMemoryAccountStore(), {
    [TOKEN]: { account: ACCOUNT, missingPermissions: [], ssoAuthorizationNeeded: false },
  });
  await auth.signIn({ token: TOKEN, rememberMe: false });
  const tracker = createRateLimitTracker(clock, null);
  const client = createGitHubClient({
    auth,
    tracker,
    cache: inMemoryCache(clock),
    clock,
    onUnauthorized: () => undefined,
  });
  return { read: createGitHubRead(client), tracker };
}

const queryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

/** Mounts Home's three searches as `useHome` does, and waits for their first load. */
async function mountHome(client: QueryClient, read: Awaited<ReturnType<typeof setup>>["read"]) {
  for (const search of HOME_SEARCHES) {
    const observer = new QueryObserver(client, homeSearchQueryOptions(read, ACCOUNT, search));
    cleanups.push(observer.subscribe(() => undefined));
  }
  await vi.waitFor(() => {
    expect(
      client.getQueryCache().findAll({ predicate: (q) => q.state.data === undefined }),
    ).toEqual([]);
  });
}

const delta = async (before: { requests: number; graphqlCost: number }) => {
  const after = await github.budget();
  return {
    requests: after.requests - before.requests,
    graphqlCost: after.graphqlCost - before.graphqlCost,
  };
};

describe("Home search mapping (FR-5.4, BR-11)", () => {
  it("maps a recorded row onto the domain PullRequest, re-review fields included", async () => {
    serveHome({ "review-requested": 0, authored: 0, "reviewed-by": 20 });
    const { read } = await setup();

    const result = await read.searchHome(ACCOUNT.id, ACCOUNT.login, "reviewed-by", null);

    if (!result.ok) throw new Error(result.error.kind);
    const { pullRequests, nextCursor, totalCount } = result.value.data;
    expect({ nextCursor, totalCount, rows: pullRequests.length }).toEqual({
      nextCursor: null,
      totalCount: 20,
      rows: 20,
    });
    expect(pullRequests[8]).toEqual({
      id: "PR_reviewed-by_8",
      repository: "octo-owner-1/repo-4",
      number: 611,
      title: "Fixture change 9",
      url: "https://github.com/octo-owner-1/repo-4/pull/611",
      author: { login: "octo-user-8", typename: "User" },
      labels: [],
      isDraft: false,
      createdAt: recorded[8]!.createdAt,
      updatedAt: recorded[8]!.updatedAt,
      headSha: recorded[8]!.headRefOid,
      additions: recorded[8]!.additions,
      deletions: recorded[8]!.deletions,
      // One comment plus one review.
      commentCount: 2,
      reviewDecision: null,
      checkState: "SUCCESS",
      mergeable: "MERGEABLE",
      reviewRequests: [{ kind: "user", login: "octo-user-10" }],
      reviews: [
        {
          state: "COMMENTED",
          submittedAt: "2026-10-15T06:28:23Z",
          author: { login: "octo-user-9", typename: "Bot" },
        },
      ],
      headCommittedAt: recorded[8]!.commits.nodes[0]!.commit.committedDate,
      // The latest REVIEW_REQUESTED_EVENT names the viewer.
      viewerReviewRequestedAt: "2026-10-16T03:13:11Z",
      activity: [
        {
          kind: "comment",
          author: { login: "octo-user-11", typename: "Bot" },
          createdAt: "2026-10-15T06:33:08Z",
        },
        {
          kind: "commit",
          author: null,
          createdAt: recorded[8]!.commits.nodes[0]!.commit.committedDate,
        },
      ],
    });
    // Another viewer: the same event is not theirs.
    const other = await read.searchHome(ACCOUNT.id, "someone-else", "reviewed-by", null);
    if (!other.ok) throw new Error(other.error.kind);
    expect(other.value.data.pullRequests[8]?.viewerReviewRequestedAt).toBeNull();
  });

  it("base searches carry no re-review fields; draft, failing CI and labels come through", async () => {
    serveHome({ "review-requested": 20, authored: 0, "reviewed-by": 0 });
    const { read } = await setup();

    const result = await read.searchHome(ACCOUNT.id, ACCOUNT.login, "review-requested", null);

    if (!result.ok) throw new Error(result.error.kind);
    const draft = result.value.data.pullRequests[16];
    expect(draft).toMatchObject({
      isDraft: true,
      checkState: "FAILURE",
      labels: ["label-1"],
      headCommittedAt: null,
      viewerReviewRequestedAt: null,
    });
    expect(draft?.activity.map((a) => a.kind)).toEqual(["comment"]);
    expect(github.requests.every((r) => r.url === GRAPHQL_URL)).toBe(true);
  });

  it("maps activity since the markers in request order; a missing PR is null", async () => {
    github.graphql(async (request) => {
      const { variables } = (await request.json()) as { variables: Record<string, unknown> };
      expect([variables["use0"], variables["use1"], variables["use2"]]).toEqual([
        true,
        true,
        false,
      ]);
      expect([variables["owner1"], variables["name1"], variables["number1"]]).toEqual([
        "octo-owner-1",
        "repo-2",
        7,
      ]);
      expect(variables["since0"]).toBe("2026-10-15T00:00:00Z");
      return reply({
        data: {
          a0: { pullRequest: null },
          a1: {
            pullRequest: {
              id: "PR_x",
              timelineItems: {
                nodes: [
                  null,
                  {
                    __typename: "PullRequestReview",
                    createdAt: "2026-10-16T01:00:00Z",
                    author: { __typename: "User", login: "octo-user-2" },
                  },
                ],
              },
            },
          },
          rateLimit,
        },
      });
    });
    const { read } = await setup();

    const result = await read.getActivitySince(ACCOUNT.id, [
      { repository: "octo-owner-1/repo-1", number: 1, since: "2026-10-15T00:00:00Z" },
      { repository: "octo-owner-1/repo-2", number: 7, since: "2026-10-15T00:00:00Z" },
    ]);

    if (!result.ok) throw new Error(result.error.kind);
    expect(result.value.data).toEqual([
      null,
      [
        {
          kind: "review",
          author: { login: "octo-user-2", typename: "User" },
          createdAt: "2026-10-16T01:00:00Z",
        },
      ],
    ]);
    await expect(
      read.getActivitySince(
        ACCOUNT.id,
        Array.from({ length: 11 }, (_, i) => ({
          repository: "a/b",
          number: i + 1,
          since: "2026-10-15T00:00:00Z",
        })),
      ),
    ).rejects.toThrow(/10/);
  });
});

describe("Home budget (AC-3.1), counted with budget()", () => {
  it("a refresh with ≤ 20 PRs per search is 3 requests and 3 points", async () => {
    serveHome({ "review-requested": 20, authored: 7, "reviewed-by": 0 });
    const { read } = await setup();
    const client = queryClient();
    await mountHome(client, read);
    const before = await github.budget();

    // A T14 refresh cycle: the scheduler's refresher, as main.tsx wires it.
    await createQueryRefresher(client).refresh(ACCOUNT.id);

    expect(await delta(before)).toEqual({ requests: 3, graphqlCost: 3 });
  });

  it("60 PRs (25 + 25 + 10) are 5 requests and 5 points, merged without duplicates", async () => {
    const asked = serveHome({ "review-requested": 25, authored: 25, "reviewed-by": 10 });
    const { read } = await setup();
    const client = queryClient();
    const before = await github.budget();

    const results = await Promise.all(
      HOME_SEARCHES.map((search) =>
        client.fetchQuery(homeSearchQueryOptions(read, ACCOUNT, search)),
      ),
    );

    expect(await delta(before)).toEqual({ requests: 5, graphqlCost: 5 });
    expect(asked.searches.filter((s) => s.after !== null)).toHaveLength(2);
    expect(results.map((r) => r.pullRequests.length)).toEqual([25, 25, 10]);
    expect(results.some((r) => r.truncated)).toBe(false);
  });

  it("pages to the 1,000-result cap and flags the truncation (AC-5.7)", async () => {
    serveHome({ "review-requested": 1500, authored: 0, "reviewed-by": 0 });
    const { read } = await setup();
    const client = queryClient();
    const before = await github.budget();

    const result = await client.fetchQuery(
      homeSearchQueryOptions(read, ACCOUNT, "review-requested"),
    );

    expect(result.pullRequests).toHaveLength(1000);
    expect(result.truncated).toBe(true);
    expect(await delta(before)).toEqual({ requests: 50, graphqlCost: 50 });
  });

  it('"+N new" costs 0 requests when nothing is newer than the markers, ⌈k/10⌉ otherwise', async () => {
    const asked = serveHome({ "review-requested": 20, authored: 20, "reviewed-by": 20 });
    const { read } = await setup();
    const client = queryClient();
    const prs: PullRequest[] = (
      await Promise.all(
        HOME_SEARCHES.map((search) =>
          client.fetchQuery(homeSearchQueryOptions(read, ACCOUNT, search)),
        ),
      )
    ).flatMap((r) => r.pullRequests);
    const markers = (at: string) => Object.fromEntries(prs.map((pr) => [pr.id, at]));
    const before = await github.budget();

    // No marker: "+N new" is hidden, nothing to count.
    expect(homeActivityQueryOptions(read, ACCOUNT.id, prs, null)).toEqual([]);
    expect(homeActivityQueryOptions(read, ACCOUNT.id, prs, {})).toEqual([]);
    // Every marker newer than the row's last comment or review: 0, no request.
    expect(
      homeActivityQueryOptions(read, ACCOUNT.id, prs, markers("2027-01-01T00:00:00Z")),
    ).toEqual([]);
    expect(await delta(before)).toEqual({ requests: 0, graphqlCost: 0 });

    // Older markers: the 7 rows per search with activity, 21 in all, ask in batches of 10.
    const lazy = homeActivityQueryOptions(read, ACCOUNT.id, prs, markers("2026-01-01T00:00:00Z"));
    for (const options of lazy) {
      // oxlint-disable-next-line no-await-in-loop -- reason: one request at a time, as counted
      await client.fetchQuery(options);
    }

    expect(await delta(before)).toEqual({ requests: 3, graphqlCost: 3 });
    expect(asked.activity).toEqual([10, 10, 1]);
    // Cached by updatedAt and marker: asking again costs nothing.
    for (const options of lazy) {
      // oxlint-disable-next-line no-await-in-loop -- reason: one request at a time, as counted
      await client.fetchQuery(options);
    }
    expect(await delta(before)).toEqual({ requests: 3, graphqlCost: 3 });
  });
});

describe("steady state (AC-3.2)", () => {
  it("1 h at the 5-minute interval with 25 favourites spends < 1,000 points", async () => {
    serveHome({ "review-requested": 20, authored: 7, "reviewed-by": 3 });
    // Starts after the real now, so data the query client stamped with Date.now() is older
    // than the scheduler's clock and the first refresh is due at once: 12 in the hour.
    const time = manualTime("2030-01-01T00:00:00.000Z");
    const { read, tracker } = await setup(time.clock);
    const client = queryClient();
    const favouriteIds = favouritesFixture.body.data.nodes.map((node) => node.id);
    expect(favouriteIds).toHaveLength(25);
    const favourites = new QueryObserver(
      client,
      favouriteBatchQueryOptions(read, ACCOUNT.id, favouriteIds),
    );
    cleanups.push(favourites.subscribe(() => undefined));
    await mountHome(client, read);
    const crossTab = inMemoryCrossTab();
    const scheduler = createRefreshScheduler({
      clock: time.clock,
      timer: time.timer,
      visibility: fakeSignal(true),
      online: fakeSignal(true),
      crossTab,
      rateLimits: tracker,
      refresher: createQueryRefresher(client),
    });
    scheduler.setAccount(ACCOUNT.id);
    scheduler.start();
    cleanups.push(() => scheduler.stop());
    const before = await github.budget();

    for (let refresh = 0; refresh < 12; refresh += 1) {
      // oxlint-disable-next-line no-await-in-loop -- reason: simulated time moves one interval at a time
      await time.advance(refresh === 0 ? 0 : 5 * 60 * 1000);
      // oxlint-disable-next-line no-await-in-loop -- reason: each refresh finishes before the next interval
      await vi.waitFor(() => {
        expect(crossTab.published.filter((m) => m.type === "refreshed")).toHaveLength(refresh + 1);
      });
    }

    const spent = await delta(before);
    // 3 searches + 1 favourites batch per refresh.
    expect(spent).toEqual({ requests: 48, graphqlCost: 48 });
    expect(spent.graphqlCost).toBeLessThan(1000);
  });
});

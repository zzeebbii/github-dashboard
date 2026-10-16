import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import { HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInMemoryAccountStore } from "../../../tests/fakes/in-memory-account-store.ts";
import { createInMemoryAuth } from "../../../tests/fakes/in-memory-auth.ts";
import { inMemoryCache } from "../../../tests/fakes/in-memory-cache.ts";
import fixture from "../../../tests/fixtures/github/graphql-home-search.json";
import { setupGitHubServer } from "../../../tests/msw/github.ts";
import { guardAgainstTokenLeaks } from "../../../tests/token-leak-guard.ts";
import { createQueryRefresher } from "../../application/refresh-scheduler.ts";
import { repoPullRequestsQueryOptions } from "../../application/repos/use-repo-page.ts";
import { toAccountId, type Account } from "../../domain/account.ts";
import { createGitHubClient } from "./client.ts";
import { createGitHubRead } from "./github-read.ts";
import { createRateLimitTracker } from "./rate-limit.ts";

// Obviously fake, shaped so secret scanners do not match it.
const TOKEN = "github_pat_FAKE_repo_fixture_token_for_tests_only";
const ACCOUNT: Account = {
  id: toAccountId(1000001)!,
  login: "octo-user-10",
  avatarUrl: "https://avatars.githubusercontent.com/u/1000001?v=4",
  tokenType: "fine-grained",
  scopes: [],
  rememberMe: false,
};
const REPO = { owner: "octo-owner-1", name: "repo-1" };

const github = setupGitHubServer();
guardAgainstTokenLeaks([TOKEN]);
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

const recorded = fixture.body.data.search.nodes;
const { rateLimit } = fixture.body.data;
const reply = (body: unknown) =>
  new HttpResponse(JSON.stringify(body), { status: fixture.status, headers: fixture.headers });

interface Asked {
  readonly queries: string[];
  readonly afters: (string | null)[];
}

/**
 * Serves the repository document for `octo-owner-1/repo-1` with `size` open PRs, 20 per
 * page, built from the recorded search rows; any other repository is GitHub's NOT_FOUND.
 */
function serveRepo(size: number, errors?: readonly unknown[]): Asked {
  const asked: Asked = { queries: [], afters: [] };
  github.graphql(async (request) => {
    const { query, variables } = (await request.json()) as {
      query: string;
      variables: Record<string, unknown>;
    };
    if (!query.startsWith("query RepoPullRequests")) throw new Error("unexpected document");
    asked.queries.push(query);
    const after = typeof variables["after"] === "string" ? variables["after"] : null;
    asked.afters.push(after);
    if (errors !== undefined || variables["name"] !== REPO.name) {
      return reply({
        data: { repository: null, rateLimit },
        errors: errors ?? [
          {
            type: "NOT_FOUND",
            path: ["repository"],
            message: "Could not resolve to a Repository with the name 'octo-owner-1/nope'.",
          },
        ],
      });
    }
    const start = after === null ? 0 : Number(after.slice("page:".length));
    const end = Math.min(start + 20, size);
    return reply({
      data: {
        repository: {
          id: "R_fixture_1",
          nameWithOwner: "octo-owner-1/repo-1",
          visibility: "PUBLIC",
          description: null,
          url: "https://github.com/octo-owner-1/repo-1",
          pullRequests: {
            totalCount: size,
            pageInfo: { hasNextPage: end < size, endCursor: end < size ? `page:${end}` : null },
            nodes: Array.from({ length: end - start }, (_, k) => {
              const {
                commits: _c,
                lastRequest: _l,
                ...row
              } = structuredClone(recorded[(start + k) % recorded.length]!);
              return { __typename: "PullRequest", ...row, id: `PR_${start + k}` };
            }),
          },
        },
        rateLimit,
      },
    });
  });
  return asked;
}

async function setup() {
  const clock = { now: () => new Date() };
  const auth = createInMemoryAuth(createInMemoryAccountStore(), {
    [TOKEN]: { account: ACCOUNT, missingPermissions: [], ssoAuthorizationNeeded: false },
  });
  await auth.signIn({ token: TOKEN, rememberMe: false });
  const client = createGitHubClient({
    auth,
    tracker: createRateLimitTracker(clock),
    cache: inMemoryCache(clock),
    clock,
    onUnauthorized: () => undefined,
  });
  return createGitHubRead(client);
}

const queryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

/** Mounts the page's query as `useRepoPage` does and waits for its first page. */
async function mount(client: QueryClient, read: Awaited<ReturnType<typeof setup>>) {
  const observer = new InfiniteQueryObserver(
    client,
    repoPullRequestsQueryOptions(read, ACCOUNT, REPO),
  );
  const unsubscribe = observer.subscribe(() => undefined);
  cleanups.push(unsubscribe);
  await vi.waitFor(() => {
    expect(observer.getCurrentResult().data).toBeDefined();
  });
  return { observer, unsubscribe };
}

const delta = async (before: { requests: number; graphqlCost: number }) => {
  const after = await github.budget();
  return {
    requests: after.requests - before.requests,
    graphqlCost: after.graphqlCost - before.graphqlCost,
  };
};

describe("repository page mapping (FR-4.6, AC-4.5)", () => {
  it("maps the header and the open PR rows; only open PRs are requested", async () => {
    const asked = serveRepo(3);
    const read = await setup();

    const result = await read.listRepoPullRequests(ACCOUNT.id, ACCOUNT.login, REPO, null);

    if (!result.ok) throw new Error(result.error.kind);
    const { repository, page } = result.value.data;
    expect(repository).toEqual({
      id: "R_fixture_1",
      nameWithOwner: "octo-owner-1/repo-1",
      visibility: "PUBLIC",
      description: null,
      url: "https://github.com/octo-owner-1/repo-1",
    });
    expect({ total: page.totalCount, next: page.nextCursor }).toEqual({ total: 3, next: null });
    expect(page.pullRequests.map((pr) => pr.id)).toEqual(["PR_0", "PR_1", "PR_2"]);
    // The shared row mapping (pr-row.ts), as on Home.
    expect(page.pullRequests[0]).toMatchObject({
      repository: "octo-owner-1/repo-1",
      title: "Fixture change 1",
      checkState: "SUCCESS",
      mergeable: "MERGEABLE",
      headCommittedAt: null,
    });
    // States: OPEN only, 20 per page, never mergeStateStatus (github-query-costs.md).
    expect(asked.queries[0]).toContain(
      "pullRequests(states: OPEN, orderBy: {field: UPDATED_AT, direction: DESC}, first: 20, after: $after)",
    );
    expect(asked.queries[0]).not.toMatch(/CLOSED|MERGED|mergeStateStatus/);
  });

  it("a repository that does not exist is notFound", async () => {
    serveRepo(3);
    const read = await setup();

    const result = await read.listRepoPullRequests(
      ACCOUNT.id,
      ACCOUNT.login,
      { ...REPO, name: "nope" },
      null,
    );

    expect(result).toEqual({ ok: false, error: { kind: "notFound" } });
  });

  it("a repository behind SAML is the organisation access error", async () => {
    serveRepo(3, [
      {
        type: "FORBIDDEN",
        path: ["repository"],
        message:
          "Resource protected by organization SAML enforcement. You must grant your token access.",
      },
    ]);
    const read = await setup();

    const result = await read.listRepoPullRequests(ACCOUNT.id, ACCOUNT.login, REPO, null);

    expect(result.ok ? null : result.error.kind).toBe("orgAccess");
  });
});

describe("repository page budget (ADR-0017), counted with budget()", () => {
  it("≤ 20 open PRs load in 1 request and 1 point", async () => {
    serveRepo(20);
    const read = await setup();
    const before = await github.budget();

    const { observer } = await mount(queryClient(), read);

    expect(await delta(before)).toEqual({ requests: 1, graphqlCost: 1 });
    expect(observer.getCurrentResult().hasNextPage).toBe(false);
  });

  it("45 open PRs take 3 requests when all are loaded, and a refresh refetches all 3", async () => {
    const asked = serveRepo(45);
    const read = await setup();
    const client = queryClient();
    const before = await github.budget();

    const { observer } = await mount(client, read);
    await observer.fetchNextPage();
    await observer.fetchNextPage();

    expect(await delta(before)).toEqual({ requests: 3, graphqlCost: 3 });
    expect(
      observer.getCurrentResult().data?.pages.flatMap((p) => p.page.pullRequests),
    ).toHaveLength(45);
    expect(observer.getCurrentResult().hasNextPage).toBe(false);
    expect(asked.afters).toEqual([null, "page:20", "page:40"]);

    // A T14 refresh cycle: the scheduler's refresher, as main.tsx wires it.
    await createQueryRefresher(client).refresh(ACCOUNT.id);

    expect(await delta(before)).toEqual({ requests: 6, graphqlCost: 6 });
  });

  it("a cached revisit within the refresh interval makes 0 requests", async () => {
    serveRepo(20);
    const read = await setup();
    const client = queryClient();
    const first = await mount(client, read);
    first.unsubscribe();
    const before = await github.budget();

    await mount(client, read);

    expect(await delta(before)).toEqual({ requests: 0, graphqlCost: 0 });
  });
});

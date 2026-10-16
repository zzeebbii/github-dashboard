import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInMemoryAccountStore } from "../../../tests/fakes/in-memory-account-store.ts";
import { createInMemoryAuth } from "../../../tests/fakes/in-memory-auth.ts";
import { inMemoryCache } from "../../../tests/fakes/in-memory-cache.ts";
import { GRAPHQL_URL, setupGitHubServer } from "../../../tests/msw/github.ts";
import { guardAgainstTokenLeaks } from "../../../tests/token-leak-guard.ts";
import { hydrateQueries, persistQueries } from "../../application/query-hydration.ts";
import { createQueryRefresher } from "../../application/refresh-scheduler.ts";
import { reposQueryOptions } from "../../application/repos/use-repos.ts";
import { toAccountId, type Account } from "../../domain/account.ts";
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
const HOUR = 60 * 60 * 1000;
const SAML =
  "Resource protected by organization SAML enforcement. You must grant your Personal Access token access to this organization.";

const github = setupGitHubServer();
guardAgainstTokenLeaks([TOKEN]);
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.useRealTimers();
});

/*
 * Synthetic responses shaped like queries/repos.graphql.ts: a recording needs an account
 * with 3 organisations and 450 repositories, and would carry its private names. Shapes
 * match the recorded viewer fixtures; cost is 1 per document, as measured.
 */
const RATE_LIMIT = { cost: 1, limit: 5000, remaining: 4990, resetAt: "2026-10-16T08:38:36Z" };
const HEADERS = { "content-type": "application/json; charset=utf-8" };

/** Page `page` (0-based) of `total` repositories owned by `owner`, 100 per page. */
function repoPage(owner: string, total: number, page: number) {
  const start = page * 100;
  const count = Math.max(0, Math.min(100, total - start));
  const hasNextPage = start + count < total;
  return {
    pageInfo: { hasNextPage, endCursor: hasNextPage ? `${owner}:${page + 1}` : null },
    nodes: Array.from({ length: count }, (_, i) => ({
      id: `R_${owner}_${start + i}`,
      nameWithOwner: `${owner}/repo-${start + i}`,
      visibility: "PRIVATE",
      description: null,
    })),
  };
}

type Body = { query: string; variables: Record<string, string> };

const json = (data: object, errors?: unknown) =>
  HttpResponse.json({ data: { ...data, rateLimit: RATE_LIMIT }, errors }, { headers: HEADERS });
/** The page number in a cursor made by `repoPage`. */
const page = (cursor: string) => Number(cursor.split(":")[1]);

/**
 * Answers the three repository documents for a viewer owning `sizes.viewer` repositories
 * and organisations with the given sizes. `blocked` organisations fail SSO.
 */
function serve(sizes: Record<string, number>, { blocked = [] as string[] } = {}) {
  const sent: Body[] = [];
  const { viewer: own = 0, ...orgs } = sizes;
  github.graphql(async (request) => {
    const body = (await request.json()) as Body;
    sent.push(body);
    if (body.query.startsWith("query ViewerRepositories")) {
      const after = body.variables["after"] ?? "";
      return json({ viewer: { repositories: repoPage("octo-fixture", own, page(after)) } });
    }
    if (body.query.startsWith("query OrganizationRepositories")) {
      const login = body.variables["login"] ?? "";
      const after = body.variables["after"] ?? "";
      return json({
        organization: {
          __typename: "Organization",
          login,
          repositories: repoPage(login, orgs[login] ?? 0, page(after)),
        },
      });
    }
    expect(body.query.startsWith("query Repositories")).toBe(true);
    const logins = [...Object.keys(orgs), ...blocked];
    return json(
      {
        viewer: {
          repositories: repoPage("octo-fixture", own, 0),
          organizations: {
            nodes: logins.map((login) => ({
              __typename: "Organization",
              login,
              repositories: blocked.includes(login) ? null : repoPage(login, orgs[login] ?? 0, 0),
            })),
          },
        },
      },
      blocked.length === 0
        ? undefined
        : blocked.map((login) => ({
            type: "FORBIDDEN",
            path: ["viewer", "organizations", "nodes", logins.indexOf(login), "repositories"],
            message: SAML,
          })),
    );
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

const queryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe("repository list budget (AC-4.1)", () => {
  it.each([
    // 1 + one request per further page of a single connection.
    { sizes: { viewer: 50, acme: 200, beta: 120, gamma: 80 }, requests: 3 },
    // The worst 450 can do over 4 connections: every one just over a page.
    { sizes: { viewer: 101, acme: 101, beta: 101, gamma: 147 }, requests: 5 },
    // All in one organisation.
    { sizes: { viewer: 0, acme: 450, beta: 0, gamma: 0 }, requests: 5 },
  ])("3 organisations, 450 repositories: $requests requests", async ({ sizes, requests }) => {
    serve(sizes);
    const { read } = await setup();

    const result = await read.listRepos(ACCOUNT.id);

    if (!result.ok) throw new Error(result.error.kind);
    expect(result.value.data).toHaveLength(450);
    expect(new Set(result.value.data.map((r) => r.id)).size).toBe(450);
    expect(await github.budget()).toEqual({ requests, graphqlCost: requests });
    expect(github.requests.every((r) => r.url === GRAPHQL_URL)).toBe(true);
  });

  it("is not requested again within 24 hours, refresh cycles included; manual refresh does", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-16T06:00:00Z"));
    serve({ viewer: 50, acme: 200, beta: 120, gamma: 80 });
    const { read } = await setup();
    const client = queryClient();
    const options = reposQueryOptions(read, ACCOUNT.id);
    // Mounted, as the sidebar keeps it.
    const observer = new QueryObserver(client, options);
    cleanups.push(observer.subscribe(() => undefined));
    await client.fetchQuery(options);
    const loaded = github.requests.length;

    // 23 hours of 5-minute T14 refresh cycles: the list is skipped every time.
    const refresher = createQueryRefresher(client);
    for (let minute = 5; minute <= 23 * 60; minute += 5) {
      vi.setSystemTime(new Date(Date.parse("2026-10-16T06:00:00Z") + minute * 60_000));
      // oxlint-disable-next-line no-await-in-loop -- reason: refresh cycles run one after another, as the scheduler runs them
      await refresher.refresh(ACCOUNT.id);
    }
    await client.fetchQuery(options);
    expect(github.requests).toHaveLength(loaded);

    // The sidebar's refresh button.
    await observer.refetch();
    expect(github.requests).toHaveLength(loaded * 2);

    // A day after that, opening it fetches again.
    vi.setSystemTime(new Date(Date.now() + 24 * HOUR + 1));
    await client.fetchQuery(options);
    expect(github.requests).toHaveLength(loaded * 3);
  });

  it("is restored after a reload without a request", async () => {
    serve({ viewer: 50, acme: 200 });
    const { read, cache } = await setup();
    const first = queryClient();
    persistQueries(first, cache);
    await first.fetchQuery(reposQueryOptions(read, ACCOUNT.id));
    const before = github.requests.length;

    const reloaded = queryClient();
    await hydrateQueries(reloaded, cache, ACCOUNT.id, { timeoutMs: 300 });
    const restored = await reloaded.fetchQuery(reposQueryOptions(read, ACCOUNT.id));

    expect(github.requests).toHaveLength(before);
    expect(restored.repositories).toHaveLength(250);
  });
});

describe("organisation access (FR-3.10)", () => {
  it("an SSO-blocked organisation is reported while the others' repositories load", async () => {
    const sent = serve({ viewer: 10, acme: 120 }, { blocked: ["sso-corp"] });
    const { read } = await setup();

    const result = await read.listRepos(ACCOUNT.id);

    if (!result.ok) throw new Error(result.error.kind);
    expect(result.value.data).toHaveLength(130);
    expect(result.value.partialErrors).toEqual([
      {
        kind: "orgAccess",
        issue: { org: "sso-corp", reason: "sso", fixUrl: "https://github.com/orgs/sso-corp/sso" },
      },
    ]);
    // No further page is asked of the blocked organisation.
    expect(sent.map((b) => b.variables["login"])).not.toContain("sso-corp");
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it("a failed further page fails the list, so a partial list is never kept for 24 h", async () => {
    serve({ viewer: 10, acme: 120 });
    github.graphql(
      async (request) => {
        const body = (await request.json()) as Body;
        expect(body.query.startsWith("query Repositories")).toBe(true);
        return HttpResponse.json(
          {
            data: {
              viewer: {
                repositories: repoPage("octo-fixture", 10, 0),
                organizations: {
                  nodes: [
                    {
                      __typename: "Organization",
                      login: "acme",
                      repositories: repoPage("acme", 120, 0),
                    },
                  ],
                },
              },
              rateLimit: RATE_LIMIT,
            },
          },
          { headers: HEADERS },
        );
      },
      () => HttpResponse.json({ message: "Server Error" }, { status: 502 }),
    );
    const { read } = await setup();

    const result = await read.listRepos(ACCOUNT.id);

    expect(result).toEqual({ ok: false, error: { kind: "network" } });
  });
});

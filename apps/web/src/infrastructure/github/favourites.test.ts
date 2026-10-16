import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { createInMemoryAccountStore } from "../../../tests/fakes/in-memory-account-store.ts";
import { createInMemoryAuth } from "../../../tests/fakes/in-memory-auth.ts";
import { inMemoryCache } from "../../../tests/fakes/in-memory-cache.ts";
import missingFixture from "../../../tests/fixtures/github/graphql-favourites-missing.json";
import batchFixture from "../../../tests/fixtures/github/graphql-favourites.json";
import { GRAPHQL_URL, setupGitHubServer } from "../../../tests/msw/github.ts";
import { guardAgainstTokenLeaks } from "../../../tests/token-leak-guard.ts";
import { createQueryRefresher } from "../../application/refresh-scheduler.ts";
import { favouriteBatchQueryOptions } from "../../application/repos/use-favourites.ts";
import { toAccountId, type Account } from "../../domain/account.ts";
import { batchesOf } from "../../domain/favourites.ts";
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

const github = setupGitHubServer();
guardAgainstTokenLeaks([TOKEN]);
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

type Fixture = { status: number; headers: Record<string, string>; body: unknown };
const reply = (fixture: Fixture, body: unknown = fixture.body) =>
  new HttpResponse(JSON.stringify(body), { status: fixture.status, headers: fixture.headers });

const recorded = batchFixture.body.data.nodes;
/** 60 favourites: the 25 recorded repositories, then synthetic ids. */
const IDS = Array.from({ length: 60 }, (_, i) => recorded[i]?.id ?? `R_fixture_${i}`);

/** Answers each batch with the recorded repositories, in the order of the ids asked for. */
function serveBatches() {
  const asked: string[][] = [];
  github.graphql(async (request) => {
    const { query, variables } = (await request.json()) as {
      query: string;
      variables: { ids: string[] };
    };
    expect(query.startsWith("query Favourites")).toBe(true);
    asked.push(variables.ids);
    const nodes = variables.ids.map((id, i) =>
      Object.assign(structuredClone(recorded[i % recorded.length] ?? {}), { id }),
    );
    return reply(batchFixture, { data: { ...batchFixture.body.data, nodes } });
  });
  return asked;
}

async function setup() {
  const auth = createInMemoryAuth(createInMemoryAccountStore(), {
    [TOKEN]: { account: ACCOUNT, missingPermissions: [], ssoAuthorizationNeeded: false },
  });
  await auth.signIn({ token: TOKEN, rememberMe: false });
  const clock = { now: () => new Date() };
  const client = createGitHubClient({
    auth,
    tracker: createRateLimitTracker(clock),
    cache: inMemoryCache(clock),
    clock,
    onUnauthorized: () => undefined,
  });
  return createGitHubRead(client);
}

describe("favourites budget (AC-3.1, FR-4.5)", () => {
  it("60 favourites refresh in exactly 3 GraphQL requests of at most 25 ids, 3 points", async () => {
    const asked = serveBatches();
    const read = await setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // What useFavourites mounts: one query per batch.
    for (const ids of batchesOf(IDS)) {
      const observer = new QueryObserver(client, favouriteBatchQueryOptions(read, ACCOUNT.id, ids));
      cleanups.push(observer.subscribe(() => undefined));
    }
    await client.refetchQueries();
    const before = await github.budget();

    // A T14 refresh cycle: the scheduler's refresher, as main.tsx wires it.
    await createQueryRefresher(client).refresh(ACCOUNT.id);

    const after = await github.budget();
    expect({
      requests: after.requests - before.requests,
      graphqlCost: after.graphqlCost - before.graphqlCost,
    }).toEqual({ requests: 3, graphqlCost: 3 });
    expect(asked.slice(-3).map((ids) => ids.length)).toEqual([25, 25, 10]);
    expect(asked.slice(-3).flat()).toEqual(IDS);
    // Only api.github.com ever saw the token.
    expect(github.requests.every((r) => r.url === GRAPHQL_URL)).toBe(true);
  });

  it("refuses more than 25 ids in one request", async () => {
    const read = await setup();
    await expect(read.refreshFavourites(ACCOUNT.id, IDS.slice(0, 26))).rejects.toThrow(/25/);
    expect(github.requests).toHaveLength(0);
  });
});

describe("favourite lookups (FR-4.7, AC-4.4)", () => {
  it("maps each repository's name, open count and open PRs with updatedAt and head SHA", async () => {
    serveBatches();
    const read = await setup();

    const result = await read.refreshFavourites(ACCOUNT.id, IDS.slice(0, 25));

    if (!result.ok) throw new Error(result.error.kind);
    const first = result.value.data[0];
    expect(first).toMatchObject({
      kind: "found",
      nodeId: IDS[0],
      nameWithOwner: "octo-owner-1/repo-1",
      openCount: 15,
    });
    if (first?.kind !== "found") throw new Error("not found");
    expect(first.pullRequests[0]).toEqual({
      id: "PR_kwDOOZZ62M6moaKQ",
      repository: "octo-owner-1/repo-1",
      number: 40,
      title: "Fixture change 1",
      url: "https://github.com/octo-owner-1/repo-1/pull/40",
      isDraft: false,
      author: { login: "octo-author-1", typename: "Bot" },
      createdAt: "2025-09-03T11:31:23Z",
      updatedAt: "2026-10-12T14:43:33Z",
      headSha: "fb56fca5f01525574c01ebc7ea9c05348cd69906",
    });
    expect(result.value.partialErrors).toEqual([]);
  });

  it("an id that no longer resolves is missing, and its NOT_FOUND is not an error", async () => {
    github.graphql(missingFixture);
    const read = await setup();

    const result = await read.refreshFavourites(ACCOUNT.id, ["R_kgDOOZZ62A", "R_kgDOAAAAAA"]);

    if (!result.ok) throw new Error(result.error.kind);
    expect(result.value.data.map((l) => l.kind)).toEqual(["found", "missing"]);
    expect(result.value.partialErrors).toEqual([]);
  });

  it("a node hidden by SSO is unknown, never unavailable, and the issue is reported", async () => {
    const body = structuredClone(missingFixture.body);
    body.errors = [
      {
        type: "FORBIDDEN",
        path: ["nodes", 1],
        locations: [{ line: 2, column: 3 }],
        message:
          "Resource protected by organization SAML enforcement. You must grant your Personal Access token access to this organization.",
      },
    ];
    github.graphql(() => reply(missingFixture, body));
    const read = await setup();

    const result = await read.refreshFavourites(ACCOUNT.id, ["R_kgDOOZZ62A", "R_sso"]);

    if (!result.ok) throw new Error(result.error.kind);
    expect(result.value.data.map((l) => l.kind)).toEqual(["found", "unknown"]);
    expect(result.value.partialErrors).toEqual([
      // The hidden node carries no organisation, so the generic fix page.
      {
        kind: "orgAccess",
        issue: { org: null, reason: "sso", fixUrl: "https://github.com/settings/tokens" },
      },
    ]);
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });
});

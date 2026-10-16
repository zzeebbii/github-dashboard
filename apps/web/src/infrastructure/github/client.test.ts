import { HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createInMemoryAccountStore } from "../../../tests/fakes/in-memory-account-store.ts";
import { createInMemoryAuth } from "../../../tests/fakes/in-memory-auth.ts";
import { inMemoryCache } from "../../../tests/fakes/in-memory-cache.ts";
import malformed from "../../../tests/fixtures/github/graphql-viewer-malformed.json";
import noOrgs from "../../../tests/fixtures/github/graphql-viewer-no-orgs.json";
import orgs from "../../../tests/fixtures/github/graphql-viewer-orgs.json";
import rateLimited from "../../../tests/fixtures/github/graphql-rate-limited.json";
import secondaryLimit from "../../../tests/fixtures/github/rest-secondary-limit.json";
import octocat from "../../../tests/fixtures/github/rest-users-octocat.json";
import octocatNotModified from "../../../tests/fixtures/github/rest-users-octocat-304.json";
import { GRAPHQL_URL, setupGitHubServer } from "../../../tests/msw/github.ts";
import { everythingAbout, guardAgainstTokenLeaks } from "../../../tests/token-leak-guard.ts";
import type { Account, AccountId } from "../../domain/account.ts";
import { toAccountId } from "../../domain/account.ts";
import { createGitHubClient } from "./client.ts";
import { createGitHubRead } from "./github-read.ts";
import { createRateLimitTracker } from "./rate-limit.ts";

// Obviously fake, shaped so secret scanners do not match it.
const TOKEN = "github_pat_FAKE_fixture_token_for_tests_only";
const NOW = new Date("2026-10-16T06:00:00Z");
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

const UserSchema = z.object({ login: z.string(), id: z.number() });

async function setup() {
  const auth = createInMemoryAuth(createInMemoryAccountStore(), {
    [TOKEN]: { account: ACCOUNT, missingPermissions: [], ssoAuthorizationNeeded: false },
  });
  await auth.signIn({ token: TOKEN, rememberMe: false });
  const clock = { now: () => NOW };
  const cache = inMemoryCache(clock);
  const tracker = createRateLimitTracker(clock);
  const unauthorized: AccountId[] = [];
  const client = createGitHubClient({
    auth,
    tracker,
    cache,
    clock,
    onUnauthorized: (id) => unauthorized.push(id),
  });
  return { client, read: createGitHubRead(client), cache, tracker, unauthorized };
}

describe("GitHub GraphQL client", () => {
  it("reads the viewer with the account's token, and counts one request and one point", async () => {
    github.graphql(noOrgs);
    const { read, tracker } = await setup();

    const result = await read.viewer(ACCOUNT);

    expect(result).toEqual({
      ok: true,
      value: {
        data: {
          login: "octo-fixture",
          name: "Octo Fixture",
          avatarUrl: "https://avatars.githubusercontent.com/u/1000001?v=4",
          organizations: [],
        },
        partialErrors: [],
      },
    });
    expect(github.requests).toEqual([
      {
        method: "POST",
        url: GRAPHQL_URL,
        authorization: `Bearer ${TOKEN}`,
        ifNoneMatch: null,
      },
    ]);
    await expect(github.budget()).resolves.toEqual({ requests: 1, graphqlCost: 1 });
    expect(tracker.get(ACCOUNT.id, "graphql")).toEqual({
      limit: 5000,
      remaining: 4996,
      resetAt: new Date("2026-10-16T06:36:07Z"),
      lastCost: 1,
    });
  });

  it("maps organisations and the viewer's teams", async () => {
    github.graphql(orgs);
    const { read } = await setup();

    const result = await read.viewer(ACCOUNT);

    expect(result.ok && result.value.data.organizations).toEqual([
      {
        login: "acme",
        name: "Acme",
        avatarUrl: "https://avatars.githubusercontent.com/u/2000001?v=4",
        teams: ["web", "platform"],
      },
      {
        login: "octo-labs",
        name: "Octo Labs",
        avatarUrl: "https://avatars.githubusercontent.com/u/2000002?v=4",
        teams: [],
      },
    ]);
  });

  it("turns a malformed response into a schema error, not a crash (AC-3.8)", async () => {
    github.graphql(malformed);
    const { read } = await setup();

    const result = await read.viewer(ACCOUNT);

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "schema",
        detail: "GitHub returned an unexpected response (viewer.login: invalid_type).",
      },
    });
  });

  it.each([
    ["a body that is not JSON", () => new HttpResponse("<html>", { status: 200 })],
    ["neither data nor errors", () => HttpResponse.json({})],
  ])("turns %s into a schema error", async (_name, respond) => {
    github.graphql(respond);
    const { read } = await setup();

    const result = await read.viewer(ACCOUNT);

    expect(result.ok ? undefined : result.error.kind).toBe("schema");
  });

  it("maps GraphQL's RATE_LIMITED to rateLimited with the header's reset time", async () => {
    github.graphql(rateLimited);
    const { read } = await setup();

    const result = await read.viewer(ACCOUNT);

    expect(result).toEqual({
      ok: false,
      error: { kind: "rateLimited", resetAt: new Date(1792132567 * 1000) },
    });
  });

  it("reports a 401 as unauthorized, for that account only", async () => {
    github.graphql(() => HttpResponse.json({ message: "Bad credentials" }, { status: 401 }));
    const { read, unauthorized } = await setup();

    const result = await read.viewer(ACCOUNT);

    expect(result).toEqual({ ok: false, error: { kind: "unauthorized" } });
    expect(unauthorized).toEqual([ACCOUNT.id]);
  });

  it("makes no request for an account without a token", async () => {
    const { read, unauthorized } = await setup();
    const other = { ...ACCOUNT, id: toAccountId(2)! };

    const result = await read.viewer(other);

    expect(result).toEqual({ ok: false, error: { kind: "unauthorized" } });
    expect(unauthorized).toEqual([other.id]);
    expect(github.requests).toHaveLength(0);
  });

  it("reports a failed request as network, without its text", async () => {
    github.graphql(() => HttpResponse.error());
    const { read } = await setup();

    const result = await read.viewer(ACCOUNT);

    expect(result).toEqual({ ok: false, error: { kind: "network" } });
  });
});

describe("GitHub REST client", () => {
  it("sends the stored ETag and serves the cached body on 304 (AC-3.4)", async () => {
    github.rest("/users/octocat", octocat, octocatNotModified);
    const { client, cache, tracker } = await setup();

    const first = await client.rest(ACCOUNT.id, "/users/octocat", UserSchema);
    const second = await client.rest(ACCOUNT.id, "/users/octocat", UserSchema);

    const expected = {
      ok: true,
      value: { data: { login: "octocat", id: 583231 }, partialErrors: [] },
    };
    expect(first).toEqual(expected);
    expect(second).toEqual(expected);
    expect(github.requests.map((r) => r.ifNoneMatch)).toEqual([null, octocat.headers.etag]);
    expect(tracker.get(ACCOUNT.id, "core")?.remaining).toBe(4999);
    // The stored record is the validated body and its ETag: never a token or header.
    expect([...cache.entries.values()]).toEqual([
      {
        accountId: ACCOUNT.id,
        store: "requests",
        key: "/users/octocat",
        fetchedAt: NOW,
        data: { login: "octocat", id: 583231 },
        etag: octocat.headers.etag,
      },
    ]);
    expect(JSON.stringify([...cache.entries.values()])).not.toContain(TOKEN);
  });

  it("validates the cached body on a 304", async () => {
    github.rest("/users/octocat", octocatNotModified);
    const { client, cache } = await setup();
    await cache.put(ACCOUNT.id, "requests", "/users/octocat", { data: { login: 1 }, etag: "x" });

    const result = await client.rest(ACCOUNT.id, "/users/octocat", UserSchema);

    expect(result.ok ? undefined : result.error.kind).toBe("schema");
  });

  it("maps a secondary limit to secondaryLimit with retry-after", async () => {
    github.rest("/users/octocat", secondaryLimit);
    const { client } = await setup();

    const result = await client.rest(ACCOUNT.id, "/users/octocat", UserSchema);

    expect(result).toEqual({
      ok: false,
      error: { kind: "secondaryLimit", retryAt: new Date(NOW.getTime() + 30_000) },
    });
  });

  it("turns a malformed REST body into a schema error", async () => {
    github.rest("/users/octocat", () => HttpResponse.json({ login: 1 }));
    const { client } = await setup();

    const result = await client.rest(ACCOUNT.id, "/users/octocat", UserSchema);

    expect(result.ok ? undefined : result.error.kind).toBe("schema");
  });

  it.each(["https://evil.example/x", "//evil.example/x", "users/octocat"])(
    "refuses to send the token anywhere but api.github.com (%s)",
    async (path) => {
      const { client } = await setup();

      const error: unknown = await client
        .rest(ACCOUNT.id, path, UserSchema)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(Error);
      expect(everythingAbout(error)).not.toContain(TOKEN);
      expect(github.requests).toHaveLength(0);
    },
  );
});

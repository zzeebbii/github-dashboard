import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createInMemoryAccountStore } from "../../../tests/fakes/in-memory-account-store.ts";
import { createInMemoryAuth } from "../../../tests/fakes/in-memory-auth.ts";
import { inMemoryCache } from "../../../tests/fakes/in-memory-cache.ts";
import appNotInstalled from "../../../tests/fixtures/github/graphql-viewer-app-not-installed.json";
import fineGrainedPolicy from "../../../tests/fixtures/github/graphql-viewer-fine-grained-policy.json";
import ssoOrg from "../../../tests/fixtures/github/graphql-viewer-sso-org.json";
import ssoRequired from "../../../tests/fixtures/github/rest-sso-required.json";
import { setupGitHubServer } from "../../../tests/msw/github.ts";
import type { Account } from "../../domain/account.ts";
import { toAccountId } from "../../domain/account.ts";
import { createGitHubClient } from "./client.ts";
import { errorFromGraphQL, errorFromResponse } from "./errors.ts";
import { createGitHubRead } from "./github-read.ts";
import { createRateLimitTracker } from "./rate-limit.ts";

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

async function setup() {
  const auth = createInMemoryAuth(createInMemoryAccountStore(), {
    [TOKEN]: { account: ACCOUNT, missingPermissions: [], ssoAuthorizationNeeded: false },
  });
  await auth.signIn({ token: TOKEN, rememberMe: false });
  const clock = { now: () => NOW };
  return createGitHubClient({
    auth,
    tracker: createRateLimitTracker(clock),
    cache: inMemoryCache(clock),
    clock,
    onUnauthorized: () => undefined,
  });
}

describe("organisation access errors (FR-3.10)", () => {
  it("returns other owners' data beside an SSO-protected org's fix link (AC-3.7)", async () => {
    github.graphql(ssoOrg);
    const read = createGitHubRead(await setup());

    const result = await read.viewer(ACCOUNT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.data.organizations.map((o) => [o.login, o.teams])).toEqual([
      ["acme", ["web"]],
      ["sso-corp", []],
    ]);
    expect(result.value.partialErrors).toEqual([
      {
        kind: "orgAccess",
        issue: { org: "sso-corp", reason: "sso", fixUrl: "https://github.com/orgs/sso-corp/sso" },
      },
    ]);
  });

  it.each([
    [
      fineGrainedPolicy,
      {
        org: "strict-corp",
        reason: "fineGrainedPolicy",
        fixUrl: "https://github.com/settings/personal-access-tokens",
      },
    ],
    [
      appNotInstalled,
      {
        org: "no-app-corp",
        reason: "appNotInstalled",
        fixUrl: "https://github.com/settings/installations",
      },
    ],
  ])("maps %#: the fine-grained policy and the missing app install", async (fixture, issue) => {
    github.graphql(fixture);
    const read = createGitHubRead(await setup());

    const result = await read.viewer(ACCOUNT);

    expect(result.ok && result.value.partialErrors).toEqual([{ kind: "orgAccess", issue }]);
  });

  it("takes the fix URL from a REST 403's X-GitHub-SSO header", async () => {
    github.rest("/orgs/sso-corp", ssoRequired);
    const client = await setup();

    const result = await client.rest(ACCOUNT.id, "/orgs/sso-corp", z.object({}));

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "orgAccess",
        issue: {
          org: "sso-corp",
          reason: "sso",
          fixUrl: "https://github.com/orgs/sso-corp/sso?authorization_request=FIXTURE",
        },
      },
    });
  });
});

describe("errorFromGraphQL", () => {
  const context = { data: null, headers: new Headers(), now: NOW };
  const orgData = {
    viewer: { organizations: { nodes: [{ __typename: "Organization", login: "acme" }] } },
  };
  const orgPath = ["viewer", "organizations", "nodes", 0, "teams"];

  it.each([
    [{ type: "NOT_FOUND", message: "Could not resolve to a Repository" }, { kind: "notFound" }],
    [
      {
        type: "INSUFFICIENT_SCOPES",
        message: "Your token has not been granted the required scopes",
      },
      { kind: "forbidden", detail: "Your token has not been granted the required scopes" },
    ],
    [
      { type: "FORBIDDEN", message: "Resource not accessible by personal access token" },
      { kind: "forbidden", detail: "Resource not accessible by personal access token" },
    ],
    [
      { type: "MAX_NODE_LIMIT_EXCEEDED", message: "too many nodes" },
      { kind: "schema", detail: "GraphQL error MAX_NODE_LIMIT_EXCEEDED: too many nodes" },
    ],
    [
      { message: "Resource protected by organization SAML enforcement." },
      {
        kind: "orgAccess",
        issue: { org: null, reason: "sso", fixUrl: "https://github.com/settings/tokens" },
      },
    ],
  ])("maps %j", (entry, expected) => {
    expect(errorFromGraphQL(entry, context)).toEqual(expected);
  });

  it("treats a token the org will not accept as the org's fine-grained policy", () => {
    const entry = {
      type: "FORBIDDEN",
      message: "Resource not accessible by personal access token",
      path: orgPath,
    };

    expect(errorFromGraphQL(entry, { ...context, data: orgData })).toEqual({
      kind: "orgAccess",
      issue: {
        org: "acme",
        reason: "fineGrainedPolicy",
        fixUrl: "https://github.com/settings/personal-access-tokens",
      },
    });
  });

  it("never names the viewer as the organisation", () => {
    const entry = { type: "FORBIDDEN", message: "SAML enforcement", path: ["viewer", "x"] };
    const data = { viewer: { __typename: "User", login: "octo-fixture" } };

    expect(errorFromGraphQL(entry, { ...context, data })).toMatchObject({ issue: { org: null } });
  });

  it("redacts a token GitHub echoes back", () => {
    const entry = { type: "FORBIDDEN", message: `bad token ${TOKEN}` };

    expect(JSON.stringify(errorFromGraphQL(entry, context))).not.toContain(TOKEN);
  });
});

const respond = (status: number, headers: Record<string, string> = {}) =>
  new Response(null, { status, headers });

describe("errorFromResponse", () => {
  it.each([
    [respond(404), undefined, { kind: "notFound" }],
    [respond(500), undefined, { kind: "network" }],
    [
      respond(429),
      undefined,
      { kind: "secondaryLimit", retryAt: new Date(NOW.getTime() + 60_000) },
    ],
    [
      respond(403),
      "You have exceeded a secondary rate limit.",
      { kind: "secondaryLimit", retryAt: new Date(NOW.getTime() + 60_000) },
    ],
    [
      respond(403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1792132567" }),
      "API rate limit exceeded",
      { kind: "rateLimited", resetAt: new Date(1792132567 * 1000) },
    ],
    [respond(403), undefined, { kind: "forbidden", detail: "GitHub answered 403." }],
    [
      respond(403),
      "Resource not accessible by integration",
      {
        kind: "orgAccess",
        issue: {
          org: null,
          reason: "appNotInstalled",
          fixUrl: "https://github.com/settings/installations",
        },
      },
    ],
    [
      respond(403, { "x-github-sso": "required; url=https://evil.example/orgs/x/sso" }),
      undefined,
      {
        kind: "orgAccess",
        issue: { org: null, reason: "sso", fixUrl: "https://github.com/settings/tokens" },
      },
    ],
  ])("maps %#", (response, message, expected) => {
    expect(errorFromResponse(response, message, NOW)).toEqual(expected);
  });

  it("redacts a token in GitHub's message", () => {
    const error = errorFromResponse(respond(403), `Bearer ${TOKEN}`, NOW);

    expect(JSON.stringify(error)).not.toContain(TOKEN);
  });
});

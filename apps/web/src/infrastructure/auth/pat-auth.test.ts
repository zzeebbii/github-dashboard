import { HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import classicRepo from "../../../tests/fixtures/github/user-classic-repo.json";
import fineGrained from "../../../tests/fixtures/github/user-fine-grained.json";
import unauthorized from "../../../tests/fixtures/github/user-unauthorized.json";
import probeForbiddenOrg from "../../../tests/fixtures/github/graphql-probe-forbidden-org.json";
import probeInsufficientScopes from "../../../tests/fixtures/github/graphql-probe-insufficient-scopes.json";
import probeOk from "../../../tests/fixtures/github/graphql-probe-ok.json";
import { GRAPHQL_URL, USER_URL, setupGitHubServer } from "../../../tests/msw/github.ts";
import {
  entriesOf,
  everythingAbout,
  guardAgainstTokenLeaks,
} from "../../../tests/token-leak-guard.ts";
import { AuthError } from "../../application/auth.ts";
import { toAccountId } from "../../domain/account.ts";
import { createLocalAccountStore } from "../local-account-store.ts";
import { createPatAuth, parseExpiration } from "./pat-auth.ts";
import { createTokenStorage } from "./token-storage.ts";

// Obviously fake tokens, shaped so secret scanners do not match them.
const FINE_GRAINED_TOKEN = "github_pat_FAKE_fixture_token_for_tests_only";
const CLASSIC_TOKEN = "ghp_fake_classic_token_for_tests_only";
const NOW = new Date("2026-10-15T12:00:00.000Z");
const ACCOUNT_ID = toAccountId(1000001)!;

const github = setupGitHubServer();
guardAgainstTokenLeaks([FINE_GRAINED_TOKEN, CLASSIC_TOKEN]);

function setup(now = NOW) {
  const accounts = createLocalAccountStore();
  const auth = createPatAuth({ tokens: createTokenStorage(), accounts, clock: { now: () => now } });
  return { auth, accounts };
}

function storageDump(): string {
  return JSON.stringify(entriesOf(sessionStorage)) + JSON.stringify(entriesOf(localStorage));
}

async function signInError(promise: Promise<unknown>): Promise<AuthError> {
  const error: unknown = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  if (!(error instanceof AuthError)) throw new Error("expected an AuthError");
  expect(everythingAbout(error)).not.toContain(FINE_GRAINED_TOKEN);
  return error;
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe("PatAuth.signIn", () => {
  it("signs in a valid fine-grained PAT with one GET /user and one probe (AC-2.1)", async () => {
    github.respond(fineGrained, probeOk);
    const { auth, accounts } = setup();

    const result = await auth.signIn({ token: FINE_GRAINED_TOKEN, rememberMe: false });

    expect(github.requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      `GET ${USER_URL}`,
      `POST ${GRAPHQL_URL}`,
    ]);
    expect(github.requests.every((r) => r.authorization === `Bearer ${FINE_GRAINED_TOKEN}`)).toBe(
      true,
    );
    expect(github.requests.some((r) => r.url.includes(FINE_GRAINED_TOKEN))).toBe(false);

    expect(result.account).toEqual({
      id: ACCOUNT_ID,
      login: "octo-fixture",
      avatarUrl: "https://avatars.githubusercontent.com/u/1000001?v=4",
      tokenType: "fine-grained",
      scopes: [],
      expiresAt: "2026-10-20T12:00:00.000Z",
      rememberMe: false,
    });
    expect(result.missingPermissions).toEqual([]);
    expect(accounts.list()).toEqual([result.account]);
    expect(accounts.activeId()).toBe(ACCOUNT_ID);
    expect(auth.currentToken(ACCOUNT_ID)).toBe(FINE_GRAINED_TOKEN);
    // Token only in sessionStorage; the account record never holds it.
    expect(sessionStorage.getItem(`ghd:token:${ACCOUNT_ID}`)).toBe(FINE_GRAINED_TOKEN);
    expect(JSON.stringify(entriesOf(localStorage))).not.toContain(FINE_GRAINED_TOKEN);
  });

  it("reads classic scopes and an offset-form expiry", async () => {
    github.respond(classicRepo, probeOk);
    const { auth } = setup();

    const { account } = await auth.signIn({ token: CLASSIC_TOKEN, rememberMe: false });

    expect(account.tokenType).toBe("classic");
    expect(account.scopes).toEqual(["repo", "read:org"]);
    expect(account.expiresAt).toBe("2027-01-31T21:59:59.000Z");
  });

  it("keeps the token in localStorage with remember me", async () => {
    github.respond(fineGrained, probeOk);
    const { auth } = setup();

    await auth.signIn({ token: FINE_GRAINED_TOKEN, rememberMe: true });

    expect(localStorage.getItem(`ghd:token:${ACCOUNT_ID}`)).toBe(FINE_GRAINED_TOKEN);
    expect(sessionStorage.getItem(`ghd:token:${ACCOUNT_ID}`)).toBeNull();
  });

  it("rejects a 401 and stores nothing (AC-2.1)", async () => {
    github.respond(unauthorized);
    const { auth, accounts } = setup();

    const error = await signInError(auth.signIn({ token: FINE_GRAINED_TOKEN, rememberMe: false }));

    expect(error.kind).toBe("invalid-token");
    expect(github.requests).toHaveLength(1);
    expect(accounts.list()).toEqual([]);
    expect(sessionStorage).toHaveLength(0);
    expect(localStorage).toHaveLength(0);
  });

  it("treats an already expired token as a 401", async () => {
    github.respond(fineGrained);
    const { auth } = setup(new Date("2026-10-20T12:00:00.000Z"));

    const error = await signInError(auth.signIn({ token: FINE_GRAINED_TOKEN, rememberMe: false }));

    expect(error.kind).toBe("expired");
    expect(storageDump()).toBe("{}{}");
  });

  it("refuses a malformed token without calling GitHub", async () => {
    const { auth } = setup();

    const error = await signInError(auth.signIn({ token: "not a token\nX: y", rememberMe: false }));

    expect(error.kind).toBe("invalid-format");
    expect(github.requests).toHaveLength(0);
  });

  it.each([
    ["fine-grained FORBIDDEN", probeForbiddenOrg],
    ["classic INSUFFICIENT_SCOPES", probeInsufficientScopes],
  ])("lists org membership as missing on %s", async (_name, probe) => {
    github.respond(fineGrained, probe);
    const { auth } = setup();

    const result = await auth.signIn({ token: FINE_GRAINED_TOKEN, rememberMe: false });

    expect(result.missingPermissions).toEqual(["org-membership"]);
  });

  it("maps errors on checks and pull requests, and SAML enforcement", async () => {
    github.respond(fineGrained, () =>
      HttpResponse.json({
        data: null,
        errors: [
          {
            type: "FORBIDDEN",
            path: [
              "viewer",
              "pullRequests",
              "nodes",
              0,
              "commits",
              "nodes",
              0,
              "commit",
              "statusCheckRollup",
            ],
            message: "Resource not accessible by personal access token",
          },
          {
            type: "FORBIDDEN",
            path: ["viewer", "pullRequests"],
            message: "Resource not accessible by personal access token",
          },
          {
            type: "FORBIDDEN",
            path: ["viewer", "organizations", "nodes", 0],
            message:
              "Resource protected by organization SAML enforcement. You must grant your Personal Access token access to this organization.",
          },
          { type: "MAX_NODE_LIMIT_EXCEEDED", message: "unrelated" },
        ],
      }),
    );
    const { auth } = setup();

    const result = await auth.signIn({ token: FINE_GRAINED_TOKEN, rememberMe: false });

    expect(result.missingPermissions).toEqual(["checks", "pull-requests"]);
    expect(result.ssoAuthorizationNeeded).toBe(true);
  });

  it("still signs in when the probe cannot run", async () => {
    github.respond(fineGrained, () => new HttpResponse(null, { status: 502 }));
    const { auth } = setup();

    const result = await auth.signIn({ token: FINE_GRAINED_TOKEN, rememberMe: false });

    expect(result.missingPermissions).toBeNull();
  });
});

describe("PatAuth session", () => {
  it("refreshes, hides an expired token, and signs out one account", async () => {
    github.respond(fineGrained, probeOk);
    let now = NOW;
    const accounts = createLocalAccountStore();
    const auth = createPatAuth({
      tokens: createTokenStorage(),
      accounts,
      clock: { now: () => now },
    });
    await auth.signIn({ token: FINE_GRAINED_TOKEN, rememberMe: false });

    await expect(auth.refresh(ACCOUNT_ID)).resolves.toMatchObject({ login: "octo-fixture" });

    now = new Date("2026-10-21T00:00:00.000Z");
    expect(auth.currentToken(ACCOUNT_ID)).toBeNull();

    auth.signOut(ACCOUNT_ID);
    expect(accounts.list()).toEqual([]);
    expect(accounts.activeId()).toBeNull();
    expect(storageDump()).not.toContain(FINE_GRAINED_TOKEN);
    await expect(auth.refresh(ACCOUNT_ID)).rejects.toMatchObject({ kind: "invalid-token" });
  });
});

describe("parseExpiration", () => {
  it.each([
    ["2026-10-20 12:00:00 UTC", "2026-10-20T12:00:00.000Z"],
    ["2026-10-20 12:00:00 -0130", "2026-10-20T13:30:00.000Z"],
    [null, null],
    ["", null],
    ["tomorrow", null],
  ])("%s → %s", (header, expected) => {
    expect(parseExpiration(header)).toBe(expected);
  });
});

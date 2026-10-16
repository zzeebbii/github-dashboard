import { HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import exchangeOk from "../../../tests/fixtures/github/app-exchange-token.json";
import probeOk from "../../../tests/fixtures/github/graphql-probe-ok.json";
import fineGrained from "../../../tests/fixtures/github/user-fine-grained.json";
import { GRAPHQL_URL, USER_URL, setupGitHubServer } from "../../../tests/msw/github.ts";
import {
  entriesOf,
  everythingAbout,
  guardAgainstTokenLeaks,
} from "../../../tests/token-leak-guard.ts";
import { AuthError } from "../../application/auth.ts";
import { toAccountId } from "../../domain/account.ts";
import { createLocalAccountStore } from "../local-account-store.ts";
import { createGitHubAppAuth } from "./github-app-auth.ts";
import { createPatAuth } from "./pat-auth.ts";
import { codeChallenge, randomUrlSafe } from "./pkce.ts";
import { createTokenStorage } from "./token-storage.ts";

const EXCHANGE_URL = "https://exchange.example.test/github-app";
const ORIGIN = "https://dashboard.example.test";
const CLIENT_ID = "Iv23liFAKEclientid01";
const ACCESS = exchangeOk.body.access_token;
const REFRESH = exchangeOk.body.refresh_token;
const NEW_ACCESS = "ghu_FAKE_refreshed_user_token_for_tests";
const NEW_REFRESH = "ghr_FAKE_refreshed_refresh_token_for_tests";
const ACCOUNT_ID = toAccountId(1000001)!;
const HOUR = 3_600_000;

const github = setupGitHubServer();
guardAgainstTokenLeaks([ACCESS, REFRESH, NEW_ACCESS, NEW_REFRESH]);

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

function setup() {
  let time = Date.parse("2026-10-16T08:00:00Z");
  const accounts = createLocalAccountStore();
  const tokens = createTokenStorage();
  const navigate = vi.fn<(url: string) => void>();
  const auth = createGitHubAppAuth({
    config: { clientId: CLIENT_ID, exchangeUrl: EXCHANGE_URL },
    base: createPatAuth({ tokens, accounts }),
    tokens,
    accounts,
    clock: { now: () => new Date(time) },
    origin: ORIGIN,
    navigate,
  });
  const advance = (ms: number) => {
    time += ms;
  };
  /** Runs start() and returns the authorisation URL it navigated to. */
  const start = async () => {
    await auth.start();
    const url = navigate.mock.lastCall?.[0];
    if (url === undefined) throw new Error("start() did not navigate");
    return new URL(url);
  };
  return { auth, accounts, advance, start };
}

/** Answers the exchange URL with `response`, keeping each request body. */
function recordExchange(response: object): unknown[] {
  const bodies: unknown[] = [];
  github.post(EXCHANGE_URL, (request) =>
    request.json().then((body: unknown) => {
      bodies.push(body);
      return HttpResponse.json(response);
    }),
  );
  return bodies;
}

/** A misbehaving handler that echoes every secret it saw back. */
const echo = (status: number) => () =>
  HttpResponse.json({ error: `bad ${ACCESS} ${REFRESH} Bearer ${ACCESS}` }, { status });

const exchangeCalls = () => github.requests.filter((r) => r.url === EXCHANGE_URL);

function respondToSignIn() {
  github.post(EXCHANGE_URL, exchangeOk);
  github.respond(fineGrained, probeOk);
}

async function signedIn() {
  respondToSignIn();
  const ctx = setup();
  const state = (await ctx.start()).searchParams.get("state");
  await ctx.auth.complete(`?code=fake-code&state=${state}`);
  github.requests.length = 0;
  return ctx;
}

describe("pkce", () => {
  it("matches the RFC 7636 appendix B example", async () => {
    await expect(codeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).resolves.toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("makes 43 URL-safe characters, different every time", () => {
    const a = randomUrlSafe();
    expect(a).toMatch(/^[\w-]{43}$/);
    expect(randomUrlSafe()).not.toBe(a);
  });
});

describe("GitHubAppAuth.start (AC-2.3)", () => {
  it("redirects to GitHub with client_id, state and an S256 code_challenge", async () => {
    const { start } = setup();

    const url = await start();

    expect(`${url.origin}${url.pathname}`).toBe("https://github.com/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(url.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/auth/callback`);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe("offline_access");
    const pending = JSON.parse(sessionStorage.getItem("ghd:github-app:pending") ?? "") as {
      state: string;
      verifier: string;
    };
    expect(url.searchParams.get("state")).toBe(pending.state);
    expect(url.searchParams.get("code_challenge")).toBe(await codeChallenge(pending.verifier));
    // The verifier never leaves the browser until the exchange.
    expect(url.toString()).not.toContain(pending.verifier);
    expect(github.requests).toHaveLength(0);
  });
});

describe("GitHubAppAuth.complete", () => {
  it("exchanges the code once, then signs in like a PAT", async () => {
    respondToSignIn();
    const { auth, start, accounts } = setup();
    const state = (await start()).searchParams.get("state");
    const verifier = (
      JSON.parse(sessionStorage.getItem("ghd:github-app:pending") ?? "") as { verifier: string }
    ).verifier;
    const bodies = recordExchange(exchangeOk.body);

    const result = await auth.complete(`?code=fake-code&state=${state}`);

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toEqual({
      code: "fake-code",
      code_verifier: verifier,
      redirect_uri: `${ORIGIN}/auth/callback`,
    });
    expect(github.requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      `POST ${EXCHANGE_URL}`,
      `GET ${USER_URL}`,
      `POST ${GRAPHQL_URL}`,
    ]);
    // Nothing GitHub-bound carries a token except as the Authorization header.
    expect(github.requests[0]?.authorization).toBeNull();
    expect(github.requests[1]?.authorization).toBe(`Bearer ${ACCESS}`);
    expect(result.account).toMatchObject({ id: ACCOUNT_ID, tokenType: "github-app", scopes: [] });
    expect(accounts.activeId()).toBe(ACCOUNT_ID);
    await expect(auth.currentToken(ACCOUNT_ID)).resolves.toBe(ACCESS);
    // Both tokens session-only, under the token keys; the pending attempt is gone.
    expect(Object.keys(entriesOf(sessionStorage)).toSorted()).toEqual([
      `ghd:refresh:${ACCOUNT_ID}`,
      `ghd:token:${ACCOUNT_ID}`,
    ]);
    expect(JSON.stringify(entriesOf(localStorage))).not.toMatch(/gh[ur]_/);
  });

  // AC-2.8: each is rejected before the exchange URL is called.
  it.each([
    ["missing state", (_state: string) => "?code=fake-code"],
    ["mismatched state", (_state: string) => `?code=fake-code&state=${randomUrlSafe()}`],
    ["missing code", (state: string) => `?state=${state}`],
    ["GitHub's access_denied", (state: string) => `?error=access_denied&state=${state}`],
  ])("rejects a callback with a %s", async (_name, search) => {
    respondToSignIn();
    const { auth, start } = setup();
    const state = (await start()).searchParams.get("state") ?? "";

    const error = await auth.complete(search(state)).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AuthError);
    expect(error).toMatchObject({ kind: "invalid-callback" });
    expect(exchangeCalls()).toHaveLength(0);
    // Single use: even the right state cannot be tried again after a failure.
    await expect(auth.complete(`?code=fake-code&state=${state}`)).rejects.toMatchObject({
      kind: "invalid-callback",
    });
    expect(exchangeCalls()).toHaveLength(0);
  });

  it("rejects a reused state", async () => {
    respondToSignIn();
    const { auth, start } = setup();
    const search = `?code=fake-code&state=${(await start()).searchParams.get("state")}`;
    await auth.complete(search);

    await expect(auth.complete(search)).rejects.toMatchObject({ kind: "invalid-callback" });
    expect(exchangeCalls()).toHaveLength(1);
  });

  it("rejects a state older than 10 minutes", async () => {
    respondToSignIn();
    const { auth, start, advance } = setup();
    const state = (await start()).searchParams.get("state");
    advance(10 * 60_000 + 1);

    await expect(auth.complete(`?code=fake-code&state=${state}`)).rejects.toMatchObject({
      kind: "invalid-callback",
    });
    expect(exchangeCalls()).toHaveLength(0);
  });

  it("rejects a callback when no sign-in was started in this tab", async () => {
    respondToSignIn();
    const { auth } = setup();

    await expect(auth.complete("?code=fake-code&state=anything")).rejects.toMatchObject({
      kind: "invalid-callback",
    });
    expect(exchangeCalls()).toHaveLength(0);
  });

  it.each([
    ["400", echo(400), "invalid-token"],
    ["500", echo(500), "unexpected-response"],
    ["malformed 200", echo(200), "unexpected-response"],
    ["network failure", () => HttpResponse.error(), "network"],
  ])("maps an exchange %s to an AuthError and stores nothing", async (_name, responder, kind) => {
    github.post(EXCHANGE_URL, responder);
    const { auth, start, accounts } = setup();
    const state = (await start()).searchParams.get("state");

    const error = await auth
      .complete(`?code=fake-code&state=${state}`)
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ kind });
    expect(everythingAbout(error)).not.toMatch(/gh[ur]_FAKE/);
    expect(accounts.list()).toEqual([]);
    expect(sessionStorage).toHaveLength(0);
  });

  it("keeps no refresh record when the App's tokens do not expire", async () => {
    github.post(EXCHANGE_URL, () => HttpResponse.json({ access_token: ACCESS }));
    github.respond(fineGrained, probeOk);
    const { auth, start, advance } = setup();
    const state = (await start()).searchParams.get("state");
    await auth.complete(`?code=fake-code&state=${state}`);
    advance(24 * HOUR);

    await expect(auth.currentToken(ACCOUNT_ID)).resolves.toBe(ACCESS);
    expect(sessionStorage.getItem(`ghd:refresh:${ACCOUNT_ID}`)).toBeNull();
    expect(exchangeCalls()).toHaveLength(1);
  });
});

describe("GitHubAppAuth token refresh", () => {
  const refreshed = {
    ...exchangeOk.body,
    access_token: NEW_ACCESS,
    refresh_token: NEW_REFRESH,
  };

  it("uses the token as is until shortly before it expires", async () => {
    const { auth, advance } = await signedIn();
    advance(7 * HOUR);

    await expect(auth.currentToken(ACCOUNT_ID)).resolves.toBe(ACCESS);
    expect(github.requests).toHaveLength(0);
  });

  it("refreshes once through the exchange URL when expiry is near, for concurrent callers", async () => {
    const { auth, advance } = await signedIn();
    const bodies = recordExchange(refreshed);
    advance(8 * HOUR - 60_000);

    const tokens = await Promise.all([
      auth.currentToken(ACCOUNT_ID),
      auth.currentToken(ACCOUNT_ID),
    ]);

    expect(tokens).toEqual([NEW_ACCESS, NEW_ACCESS]);
    expect(bodies).toEqual([{ grant_type: "refresh_token", refresh_token: REFRESH }]);
    expect(sessionStorage.getItem(`ghd:token:${ACCOUNT_ID}`)).toBe(NEW_ACCESS);
    expect(sessionStorage.getItem(`ghd:refresh:${ACCOUNT_ID}`)).toContain(NEW_REFRESH);
    // The new pair is good for another 8 hours.
    advance(7 * HOUR);
    await expect(auth.currentToken(ACCOUNT_ID)).resolves.toBe(NEW_ACCESS);
    expect(exchangeCalls()).toHaveLength(1);
  });

  it("refreshes before re-validating the account", async () => {
    const { auth, advance } = await signedIn();
    github.post(EXCHANGE_URL, () => HttpResponse.json(refreshed));
    github.respond(fineGrained);
    advance(8 * HOUR);

    await auth.refresh(ACCOUNT_ID);

    expect(github.requests.find((r) => r.url === USER_URL)?.authorization).toBe(
      `Bearer ${NEW_ACCESS}`,
    );
  });

  it("keeps a still-valid token, and gives none for an expired one, when refresh fails", async () => {
    const { auth, advance } = await signedIn();
    github.post(EXCHANGE_URL, () =>
      HttpResponse.json({ error: "bad_refresh_token" }, { status: 400 }),
    );

    advance(8 * HOUR - 60_000);
    await expect(auth.currentToken(ACCOUNT_ID)).resolves.toBe(ACCESS);
    advance(60_000);
    await expect(auth.currentToken(ACCOUNT_ID)).resolves.toBeNull();
  });

  it("does not try a refresh token past its 6 months", async () => {
    const { auth, advance } = await signedIn();
    advance(15_897_600_000);

    await expect(auth.currentToken(ACCOUNT_ID)).resolves.toBeNull();
    expect(github.requests).toHaveLength(0);
  });

  it("signing out deletes both tokens; a pasted PAT replaces the App session", async () => {
    const { auth } = await signedIn();
    auth.signOut(ACCOUNT_ID);
    expect(sessionStorage).toHaveLength(0);

    const again = await signedIn();
    github.respond(fineGrained, probeOk);
    await again.auth.signIn({
      token: "github_pat_FAKE_fixture_token_for_tests_only",
      rememberMe: false,
    });
    expect(sessionStorage.getItem(`ghd:refresh:${ACCOUNT_ID}`)).toBeNull();
  });
});

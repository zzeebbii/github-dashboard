import { HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import fineGrained from "../../../tests/fixtures/github/user-fine-grained.json";
import probeOk from "../../../tests/fixtures/github/graphql-probe-ok.json";
import { setupGitHubServer } from "../../../tests/msw/github.ts";
import {
  entriesOf,
  everythingAbout,
  guardAgainstTokenLeaks,
} from "../../../tests/token-leak-guard.ts";
import { AuthError, redact } from "../../application/auth.ts";
import { toAccountId } from "../../domain/account.ts";
import { createLocalAccountStore } from "../local-account-store.ts";
import { createPatAuth } from "./pat-auth.ts";
import { createTokenStorage } from "./token-storage.ts";

/**
 * AC-2.7 (partial: there is no IndexedDB cache yet). Drives every auth error path and
 * asserts the token appears in no thrown error (message, stack, cause, serialised form),
 * no console output, and no stored account record. pat-auth.test.ts and SignIn.test.tsx
 * install the same console guard.
 */

const TOKEN = "github_pat_FAKE_redaction_probe_token_value";

const github = setupGitHubServer();
guardAgainstTokenLeaks([TOKEN]);

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

function setup(now = new Date("2026-10-15T12:00:00.000Z")) {
  return createPatAuth({
    tokens: createTokenStorage(),
    accounts: createLocalAccountStore(),
    clock: { now: () => now },
  });
}

/** Echoes the Authorization header back, as a misbehaving proxy might. */
const echo =
  (status: number, headers: Record<string, string> = {}) =>
  () =>
    HttpResponse.json(
      { message: `Bearer ${TOKEN} was refused`, token: TOKEN },
      { status, headers },
    );

const scenarios: [string, () => void, Date?][] = [
  ["401", () => github.respond(echo(401))],
  [
    "403 SAML SSO",
    () =>
      github.respond(
        echo(403, {
          "X-GitHub-SSO":
            "required; url=https://github.com/orgs/fixture-org/sso?authorization_request=FAKE",
        }),
      ),
  ],
  ["403 rate limit", () => github.respond(echo(403, { "X-RateLimit-Remaining": "0" }))],
  ["429", () => github.respond(echo(429))],
  ["500", () => github.respond(echo(500))],
  ["malformed 200 body", () => github.respond(echo(200))],
  ["network failure", () => github.respond(() => HttpResponse.error())],
  ["expired token", () => github.respond(fineGrained), new Date("2026-11-01T00:00:00.000Z")],
];

describe("no token in errors, console or account records (AC-2.7)", () => {
  it.each(scenarios)("sign-in error path: %s", async (_name, arrange, now) => {
    arrange();
    const caught: unknown = await setup(now)
      .signIn({ token: TOKEN, rememberMe: false })
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(AuthError);
    expect(everythingAbout(caught)).not.toContain(TOKEN);
    expect(sessionStorage).toHaveLength(0);
    expect(localStorage).toHaveLength(0);
  });

  it("a malformed token is not echoed back", async () => {
    const pasted = `${TOKEN} \n`;
    const caught: unknown = await setup()
      .signIn({ token: `${pasted}extra`, rememberMe: false })
      .catch((error: unknown) => error);

    expect(everythingAbout(caught)).not.toContain(TOKEN);
  });

  it("a probe that echoes the token does not leak it", async () => {
    github.respond(fineGrained, echo(200));
    const accounts = createLocalAccountStore();
    const auth = createPatAuth({
      tokens: createTokenStorage(),
      accounts,
      clock: { now: () => new Date("2026-10-15T12:00:00.000Z") },
    });

    const result = await auth.signIn({ token: TOKEN, rememberMe: true });

    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect(JSON.stringify(accounts.list())).not.toContain(TOKEN);
    // The one place the token may be: its own storage key.
    const { [`ghd:token:${result.account.id}`]: stored, ...rest } = entriesOf(localStorage);
    expect(stored).toBe(TOKEN);
    expect(JSON.stringify(rest)).not.toContain(TOKEN);
  });

  it("refreshing a signed-out account does not leak anything", async () => {
    github.respond(fineGrained, probeOk);
    const auth = setup();
    await auth.signIn({ token: TOKEN, rememberMe: false });
    const id = toAccountId(1000001)!;
    auth.signOut(id);

    const caught: unknown = await auth.refresh(id).catch((error: unknown) => error);

    expect(everythingAbout(caught)).not.toContain(TOKEN);
  });
});

describe("redact", () => {
  it.each([
    `GitHub said: Bearer ${TOKEN}`,
    "ghp_fake_classic_token_for_tests_only in a sentence",
    "gho_fake ghu_fake ghs_fake ghr_fake",
    "legacy 0123456789abcdef0123456789abcdef01234567 token",
  ])("removes tokens from %s", (text) => {
    expect(redact(text)).not.toMatch(/gh[pousr]_|github_pat_|Bearer|[0-9a-f]{40}/);
    expect(redact(text)).toContain("[redacted]");
  });

  it("leaves ordinary messages alone", () => {
    expect(redact("This token has expired.")).toBe("This token has expired.");
  });

  it("is applied by the AuthError constructor", () => {
    expect(new AuthError("network", `failed with ${TOKEN}`).message).toBe("failed with [redacted]");
  });
});

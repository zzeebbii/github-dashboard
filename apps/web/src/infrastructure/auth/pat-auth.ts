import { z } from "zod";
import type { AccountStore } from "../../application/accounts.ts";
import { AuthError, type AuthPort, type Clock } from "../../application/auth.ts";
import { type Account, type AccountId, isExpired, toAccountId } from "../../domain/account.ts";
import { probePermissions } from "./permission-probe.ts";
import type { TokenStorage } from "./token-storage.ts";

const USER_URL = "https://api.github.com/user";

// The documented required fields of "Get the authenticated user" that we keep.
const UserSchema = z.object({
  id: z.number().int().positive(),
  login: z.string().min(1),
  avatar_url: z.string(),
});

// Every GitHub token is ASCII letters, digits and underscores. Checking before the
// request keeps whitespace or pasted junk out of the Authorization header.
const TOKEN_SHAPE = /^\w{20,255}$/;

/**
 * `github-authentication-token-expiration` is `YYYY-MM-DD HH:MM:SS UTC` or
 * `YYYY-MM-DD HH:MM:SS +HHMM`. Returns ISO 8601, or null if absent or unrecognised.
 */
export function parseExpiration(header: string | null): string | null {
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) (?:UTC|([+-]\d{2})(\d{2}))$/.exec(
    header?.trim() ?? "",
  );
  if (match === null) return null;
  const [, date, time, offsetHours, offsetMinutes] = match;
  const offset = offsetHours === undefined ? "Z" : `${offsetHours}:${offsetMinutes ?? "00"}`;
  const millis = Date.parse(`${date}T${time}${offset}`);
  return Number.isNaN(millis) ? null : new Date(millis).toISOString();
}

function errorFor(response: Response): AuthError {
  if (response.status === 401) {
    return new AuthError("invalid-token", "GitHub rejected this token.");
  }
  if (response.headers.has("X-GitHub-SSO")) {
    return new AuthError(
      "sso-required",
      "An organisation requires SAML single sign-on for this token.",
    );
  }
  if (
    response.status === 429 ||
    (response.status === 403 && response.headers.get("X-RateLimit-Remaining") === "0")
  ) {
    return new AuthError("rate-limited", "GitHub's rate limit was reached. Try again later.");
  }
  return new AuthError("unexpected-response", `GitHub answered with status ${response.status}.`);
}

interface PatAuthOptions {
  readonly tokens: TokenStorage;
  readonly accounts: AccountStore;
  readonly clock: Clock;
  /** Injected so tests can count requests; defaults to the global fetch. */
  readonly fetchImpl?: typeof fetch;
}

/** The PAT adapter for `AuthPort` (FR-2.2). */
export function createPatAuth(options: PatAuthOptions): AuthPort {
  const { tokens, accounts, clock } = options;
  const doFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);

  /** Exactly one `GET /user`. Accepts the token only on 200. */
  async function validate(token: string, rememberMe: boolean): Promise<Account> {
    if (!TOKEN_SHAPE.test(token)) {
      throw new AuthError("invalid-format", "That does not look like a GitHub token.");
    }
    let response: Response;
    try {
      response = await doFetch(USER_URL, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        credentials: "omit",
        cache: "no-store",
      });
    } catch {
      // The underlying error is dropped on purpose: its text is not ours to vouch for.
      throw new AuthError("network", "Could not reach GitHub. Check your connection.");
    }
    if (response.status !== 200) throw errorFor(response);

    const user = UserSchema.safeParse(await response.json().catch(() => null));
    const id = user.success ? toAccountId(user.data.id) : null;
    if (!user.success || id === null) {
      throw new AuthError("unexpected-response", "GitHub returned an unexpected user record.");
    }

    const fineGrained = token.startsWith("github_pat_");
    const account: Account = {
      id,
      login: user.data.login,
      avatarUrl: user.data.avatar_url,
      tokenType: fineGrained ? "fine-grained" : "classic",
      scopes: fineGrained
        ? []
        : (response.headers.get("X-OAuth-Scopes") ?? "")
            .split(",")
            .map((scope) => scope.trim())
            .filter((scope) => scope !== ""),
      expiresAt: parseExpiration(response.headers.get("github-authentication-token-expiration")),
      rememberMe,
    };
    if (isExpired(account, clock.now())) {
      throw new AuthError("expired", "This token has expired.");
    }
    return account;
  }

  return {
    async signIn({ token, rememberMe }) {
      const trimmed = token.trim();
      const account = await validate(trimmed, rememberMe);
      const probe = await probePermissions(trimmed, doFetch);
      tokens.write(account.id, trimmed, rememberMe);
      accounts.upsert(account);
      accounts.setActive(account.id);
      return {
        account,
        missingPermissions: probe?.missing ?? null,
        ssoAuthorizationNeeded: probe?.ssoAuthorizationNeeded ?? false,
      };
    },

    async refresh(accountId) {
      const stored = accounts.get(accountId);
      const token = tokens.read(accountId);
      if (stored === undefined || token === null) {
        throw new AuthError("invalid-token", "This account is signed out.");
      }
      const account = await validate(token, stored.rememberMe);
      accounts.upsert(account);
      return account;
    },

    signOut(accountId: AccountId) {
      tokens.remove(accountId);
      accounts.remove(accountId);
    },

    currentToken(accountId) {
      const account = accounts.get(accountId);
      if (account === undefined || isExpired(account, clock.now())) return null;
      return tokens.read(accountId);
    },
  };
}

import { z } from "zod";
import type { AccountStore } from "../../application/accounts.ts";
import { AuthError, type AuthPort, type GitHubAppSignInPort } from "../../application/auth.ts";
import type { GitHubAppConfig } from "../../config/env.ts";
import type { AccountId } from "../../domain/account.ts";
import { codeChallenge, randomUrlSafe } from "./pkce.ts";
import { type TokenStorage, createTokenStorage } from "./token-storage.ts";

/**
 * The GitHub App adapter (ADR-0016, FR-2.5, FR-2.11). It wraps the PAT adapter: a token the
 * exchange handler returns is signed in exactly like a pasted one (one `GET /user`, one
 * permission probe), and this adapter adds the `state` + PKCE web flow and token refresh.
 *
 * GitHub's token endpoint needs the App's secret and sends no CORS headers, so the code and
 * the refresh token go to our exchange handler instead. Its contract is in
 * docs/architecture/github-app-exchange.md.
 */

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
/** Must match the route in routes/router.tsx and the App's registered callback URL. */
const CALLBACK_PATH = "/auth/callback";
const PENDING_KEY = "ghd:github-app:pending";
const STATE_MAX_AGE_MS = 10 * 60_000;
/** Refresh this long before the access token expires (8 hours after issue). */
const REFRESH_MARGIN_MS = 5 * 60_000;

/** The one sign-in attempt in flight in this tab. Stored data is validated on read. */
const PendingSchema = z.object({
  state: z.string().min(1),
  verifier: z.string().min(43),
  createdAt: z.number(),
  rememberMe: z.boolean(),
});

const TokenSchema = z.string().regex(/^\w{20,255}$/);

/** The exchange handler's answer, for a code and for a refresh alike. */
const ExchangeResponseSchema = z.object({
  access_token: TokenSchema,
  // All three are absent when the App has token expiry turned off: the token never expires.
  expires_in: z.number().int().positive().optional(),
  refresh_token: TokenSchema.optional(),
  refresh_token_expires_in: z.number().int().positive().optional(),
});
type ExchangeResponse = z.infer<typeof ExchangeResponseSchema>;

const RefreshRecordSchema = z.object({
  refreshToken: TokenSchema,
  accessExpiresAt: z.number(),
  refreshExpiresAt: z.number(),
});
type RefreshRecord = z.infer<typeof RefreshRecordSchema>;

function parseJson<T>(schema: z.ZodType<T>, raw: string | null): T | null {
  if (raw === null) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

interface GitHubAppAuthOptions {
  readonly config: GitHubAppConfig;
  /** Signs a token in and owns the access tokens and account records. */
  readonly base: AuthPort;
  readonly tokens: TokenStorage;
  /** Refresh tokens; defaults to a "refresh" token storage over the browser's storages. */
  readonly refreshTokens?: TokenStorage;
  readonly accounts: AccountStore;
  readonly clock: { now(): Date };
  /** Where the pending `state` and PKCE verifier live; defaults to sessionStorage. */
  readonly session?: Storage;
  /** This app's origin, for `redirect_uri`; defaults to the page's. */
  readonly origin?: string;
  /** Leaves the page for GitHub; defaults to `location.assign`. */
  readonly navigate?: (url: string) => void;
  /** Injected so tests can count requests; defaults to the global fetch. */
  readonly fetchImpl?: typeof fetch;
  /** Serialises refreshes across tabs; defaults to the browser's, `undefined` means none. */
  readonly locks?: LockManager | undefined;
}

export function createGitHubAppAuth(options: GitHubAppAuthOptions): AuthPort & GitHubAppSignInPort {
  const { config, base, tokens, accounts, clock } = options;
  // Refresh tokens follow the access token's storage rule (FR-2.11), under their own key.
  const refreshTokens =
    options.refreshTokens ?? createTokenStorage(sessionStorage, localStorage, "refresh");
  // navigator.locks is missing outside secure contexts and in older browsers.
  const locks = "locks" in options ? options.locks : (navigator.locks as LockManager | undefined);
  const session = options.session ?? sessionStorage;
  const redirectUri = `${options.origin ?? location.origin}${CALLBACK_PATH}`;
  const navigate = options.navigate ?? ((url: string) => location.assign(url));
  const doFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const refreshing = new Map<AccountId, Promise<string | null>>();
  const now = () => clock.now().getTime();

  /** Reads and deletes the pending attempt: a `state` is good for one callback only. */
  function takePending() {
    const raw = session.getItem(PENDING_KEY);
    session.removeItem(PENDING_KEY);
    return parseJson(PendingSchema, raw);
  }

  /** One POST to the exchange handler. Nothing from its answer reaches an error message. */
  async function exchange(body: Record<string, string>): Promise<ExchangeResponse> {
    let response: Response;
    try {
      response = await doFetch(config.exchangeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        credentials: "omit",
        cache: "no-store",
        // A redirect would resend the code or refresh token somewhere we did not configure.
        redirect: "error",
      });
    } catch {
      throw new AuthError("network", "Could not reach the sign-in service.");
    }
    if (!response.ok) {
      // 400/401: GitHub refused the code or refresh token (bad, used or expired).
      const kind =
        response.status === 400 || response.status === 401
          ? "invalid-token"
          : "unexpected-response";
      throw new AuthError(kind, `The sign-in service answered with status ${response.status}.`);
    }
    const parsed = ExchangeResponseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      throw new AuthError("unexpected-response", "The sign-in service sent an unexpected answer.");
    }
    return parsed.data;
  }

  function saveRefresh(id: AccountId, data: ExchangeResponse, rememberMe: boolean): void {
    const { refresh_token, expires_in, refresh_token_expires_in } = data;
    if (
      refresh_token === undefined ||
      expires_in === undefined ||
      refresh_token_expires_in === undefined
    ) {
      refreshTokens.remove(id);
      return;
    }
    const record: RefreshRecord = {
      refreshToken: refresh_token,
      accessExpiresAt: now() + expires_in * 1000,
      refreshExpiresAt: now() + refresh_token_expires_in * 1000,
    };
    refreshTokens.write(id, JSON.stringify(record), rememberMe);
  }

  /** The stored token, if another tab has rotated past `spent` and it is still valid. */
  function rotatedElsewhere(id: AccountId, spent: string): string | null {
    const latest = parseJson(RefreshRecordSchema, refreshTokens.read(id));
    const token = tokens.read(id);
    const rotated = latest !== null && latest.refreshToken !== spent;
    return rotated && now() < latest.accessExpiresAt ? token : null;
  }

  /**
   * Trades the refresh token for a new pair. Refresh tokens are single use, so concurrent
   * requests in this tab share one refresh, and tabs take turns under a Web Lock: every tab
   * holding the same pair (remembered, or shared by session-sharing.ts) reaches the expiry
   * margin at the same moment. The tab that waited finds the new pair and uses it. If the
   * new pair's broadcast arrives only after the lock does, its own exchange fails and the
   * re-read afterwards still finds the new pair.
   */
  function refreshAccess(id: AccountId, record: RefreshRecord, current: string) {
    const inFlight = refreshing.get(id);
    if (inFlight !== undefined) return inFlight;
    const stillValid = () => now() < record.accessExpiresAt;
    const run = async (): Promise<string | null> => {
      const done = rotatedElsewhere(id, record.refreshToken);
      if (done !== null) return done;
      if (now() >= record.refreshExpiresAt) return stillValid() ? current : null;
      try {
        const data = await exchange({
          grant_type: "refresh_token",
          refresh_token: record.refreshToken,
        });
        const rememberMe = accounts.get(id)?.rememberMe ?? false;
        tokens.write(id, data.access_token, rememberMe);
        saveRefresh(id, data, rememberMe);
        return data.access_token;
      } catch {
        // An expired token would only earn a 401; null tells the caller there is none.
        return rotatedElsewhere(id, record.refreshToken) ?? (stillValid() ? current : null);
      }
    };
    const locked = locks === undefined ? run() : locks.request(`ghd-auth-refresh:${id}`, run);
    const promise = locked.finally(() => refreshing.delete(id));
    refreshing.set(id, promise);
    return promise;
  }

  async function currentToken(id: AccountId): Promise<string | null> {
    const token = await base.currentToken(id);
    const record = parseJson(RefreshRecordSchema, refreshTokens.read(id));
    // A PAT, or an App token that never expires.
    if (token === null || record === null) return token;
    if (now() < record.accessExpiresAt - REFRESH_MARGIN_MS) return token;
    return refreshAccess(id, record, token);
  }

  return {
    async signIn(request) {
      const result = await base.signIn(request);
      // A pasted token replaces whatever App session this account had.
      refreshTokens.remove(result.account.id);
      return result;
    },

    async refresh(id) {
      await currentToken(id);
      return base.refresh(id);
    },

    signOut(id) {
      refreshTokens.remove(id);
      base.signOut(id);
    },

    currentToken,

    async start({ rememberMe }) {
      const state = randomUrlSafe();
      const verifier = randomUrlSafe();
      const challenge = await codeChallenge(verifier);
      session.setItem(
        PENDING_KEY,
        JSON.stringify({ state, verifier, createdAt: now(), rememberMe }),
      );
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: redirectUri,
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
        // Asks for an expiring token plus a refresh token.
        scope: "offline_access",
      });
      navigate(`${AUTHORIZE_URL}?${params.toString()}`);
    },

    async complete(search) {
      const params = new URLSearchParams(search);
      const pending = takePending();
      const state = params.get("state");
      const code = params.get("code");
      const age = pending === null ? Infinity : now() - pending.createdAt;
      if (
        pending === null ||
        state !== pending.state ||
        code === null ||
        code === "" ||
        age < 0 ||
        age > STATE_MAX_AGE_MS
      ) {
        throw new AuthError("invalid-callback", "The sign-in callback was rejected.");
      }
      const data = await exchange({
        code,
        code_verifier: pending.verifier,
        redirect_uri: redirectUri,
      });
      const { rememberMe } = pending;
      const result = await base.signIn({ token: data.access_token, rememberMe });
      saveRefresh(result.account.id, data, rememberMe);
      return result;
    },
  };
}

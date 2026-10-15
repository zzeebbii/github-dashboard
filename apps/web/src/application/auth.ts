import type { Account, AccountId } from "../domain/account.ts";

/**
 * The auth port (ADR-0016). Features depend on this, never on `fetch` or storage.
 * `PatAuth` implements it today; `GitHubAppAuth` arrives later behind the same shape.
 */
export interface AuthPort {
  /** Validates the token, stores it and the account, and makes it the active account. */
  signIn(request: SignInRequest): Promise<SignInResult>;
  /** Re-validates the stored token and returns the refreshed account. */
  refresh(accountId: AccountId): Promise<Account>;
  /** Deletes this account's token and account record. Other accounts are untouched. */
  signOut(accountId: AccountId): void;
  /** null when there is no token, or it has expired (treated as a 401, FR-2.4). */
  currentToken(accountId: AccountId): string | null;
}

export interface SignInRequest {
  readonly token: string;
  readonly rememberMe: boolean;
}

/** Read access the dashboard needs (FR-2.3). */
export type PermissionArea = "pull-requests" | "checks" | "org-membership";

export interface SignInResult {
  readonly account: Account;
  /** null when the permission probe itself could not run. */
  readonly missingPermissions: readonly PermissionArea[] | null;
  /** Some organisation enforces SAML SSO and has not authorised this token. */
  readonly ssoAuthorizationNeeded: boolean;
}

export interface Clock {
  now(): Date;
}

export type AuthErrorKind =
  | "invalid-format"
  | "invalid-token"
  | "expired"
  | "sso-required"
  | "rate-limited"
  | "network"
  | "unexpected-response";

// Every prefixed GitHub token (ghp_, gho_, ghu_, ghs_, ghr_, github_pat_), legacy
// unprefixed 40-hex tokens, and whatever follows "Bearer" if a header was echoed back.
const TOKEN_PATTERN = /\b(?:gh[pousr]_|github_pat_)\w+|\b[0-9a-f]{40}\b|\bBearer\s+\S+/gi;

/** Replaces anything token-shaped. Every error constructor in the auth path calls this. */
export function redact(text: string): string {
  return text.replace(TOKEN_PATTERN, "[redacted]");
}

/** Transport-agnostic auth failure. The message is always redacted. */
export class AuthError extends Error {
  readonly kind: AuthErrorKind;

  constructor(kind: AuthErrorKind, message: string) {
    super(redact(message));
    this.name = "AuthError";
    this.kind = kind;
  }
}

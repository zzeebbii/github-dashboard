/**
 * A signed-in GitHub account, as the app remembers it. Holds NO token: tokens live
 * only in infrastructure/auth/token-storage.ts (ADR-0016, FR-2.10).
 *
 * This file has ZERO imports. Timestamps are ISO 8601 strings; "now" is passed in.
 */

/** GitHub's numeric user id as a string. Construct only via `toAccountId()`. */
export type AccountId = string & { readonly __brand: "AccountId" };

/** `github_pat_` prefix: fine-grained. Anything else GitHub accepts: classic. */
export type TokenType = "classic" | "fine-grained";

export interface Account {
  readonly id: AccountId;
  readonly login: string;
  readonly avatarUrl: string;
  readonly tokenType: TokenType;
  /** Classic tokens only (`X-OAuth-Scopes`); always empty for fine-grained. */
  readonly scopes: readonly string[];
  /** null when the token never expires or GitHub did not say. */
  readonly expiresAt: string | null;
  readonly rememberMe: boolean;
}

function isAccountId(value: string): value is AccountId {
  return /^[1-9]\d*$/.test(value);
}

/** null when `value` is not a GitHub user id. */
export function toAccountId(value: string | number): AccountId | null {
  const text = String(value);
  return isAccountId(text) ? text : null;
}

/** FR-2.4: warn from this many days before expiry. */
const EXPIRY_WARNING_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type TokenWarning =
  | { readonly kind: "write-access" }
  | { readonly kind: "expires-soon"; readonly expiresAt: string; readonly daysLeft: number };

/** FR-2.4: an expired token is treated exactly like a 401. */
export function isExpired(account: Pick<Account, "expiresAt">, now: Date): boolean {
  return account.expiresAt !== null && Date.parse(account.expiresAt) <= now.getTime();
}

/**
 * FR-2.3 / FR-2.4. The write warning is derived from the stored scopes, so it shows
 * for as long as the account exists rather than once at sign-in.
 */
export function tokenWarnings(account: Account, now: Date): TokenWarning[] {
  const warnings: TokenWarning[] = [];
  if (account.tokenType === "classic" && account.scopes.includes("repo")) {
    warnings.push({ kind: "write-access" });
  }
  if (account.expiresAt !== null && !isExpired(account, now)) {
    const msLeft = Date.parse(account.expiresAt) - now.getTime();
    if (msLeft <= EXPIRY_WARNING_DAYS * DAY_MS) {
      warnings.push({
        kind: "expires-soon",
        expiresAt: account.expiresAt,
        daysLeft: Math.ceil(msLeft / DAY_MS),
      });
    }
  }
  return warnings;
}

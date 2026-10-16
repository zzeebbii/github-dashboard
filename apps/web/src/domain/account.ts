/**
 * A signed-in GitHub account, as the app remembers it. Holds NO token: tokens live
 * only in infrastructure/auth/token-storage.ts (ADR-0016, FR-2.10).
 *
 * This file has ZERO imports.
 */

/** GitHub's numeric user id as a string. Construct only via `toAccountId()`. */
export type AccountId = string & { readonly __brand: "AccountId" };

/**
 * `github_pat_` prefix: fine-grained. `ghu_`: a GitHub App user token (FR-2.5), which has
 * no scopes. Anything else GitHub accepts: classic.
 */
export type TokenType = "classic" | "fine-grained" | "github-app";

export interface Account {
  readonly id: AccountId;
  readonly login: string;
  readonly avatarUrl: string;
  readonly tokenType: TokenType;
  /** Classic tokens only (`X-OAuth-Scopes`); always empty for fine-grained. */
  readonly scopes: readonly string[];
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

export type TokenWarning = { readonly kind: "write-access" };

/**
 * FR-2.3. The write warning is derived from the stored scopes, so it shows for as
 * long as the account exists rather than once at sign-in.
 */
export function tokenWarnings(account: Account): TokenWarning[] {
  return account.tokenType === "classic" && account.scopes.includes("repo")
    ? [{ kind: "write-access" }]
    : [];
}

import type { AccountId } from "../domain/account.ts";
import type { AccountStore } from "./accounts.ts";

interface UnauthorizedDeps {
  readonly accounts: AccountStore;
  /** Deletes this account's token only (infrastructure/auth/token-storage.ts). */
  readonly forgetToken: (id: AccountId) => void;
  /** Opens `/sign-in?account=<login or id>`. */
  readonly toSignIn: (account: string) => void;
}

/**
 * FR-2.8: GitHub answered 401 for one account. That account alone is signed out: its
 * token goes, while its record, favourites, preferences and cache stay, so signing in
 * again picks up where it left off. Other accounts are untouched.
 */
export function createUnauthorizedHandler({ accounts, forgetToken, toSignIn }: UnauthorizedDeps) {
  return (accountId: AccountId): void => {
    forgetToken(accountId);
    toSignIn(accounts.get(accountId)?.login ?? accountId);
  };
}

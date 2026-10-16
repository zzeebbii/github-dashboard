import type { AccountStore } from "../../src/application/accounts.ts";
import { AuthError, type AuthPort, type SignInResult } from "../../src/application/auth.ts";
import type { AccountId } from "../../src/domain/account.ts";

/**
 * An `AuthPort` with no network: each known token maps to the sign-in result GitHub
 * would produce. Unknown tokens are rejected like a 401.
 */
export function createInMemoryAuth(
  accounts: AccountStore,
  results: Readonly<Record<string, SignInResult>>,
): AuthPort {
  const tokens = new Map<AccountId, string>();

  return {
    signIn({ token, rememberMe }) {
      const result = results[token];
      if (result === undefined) {
        return Promise.reject(new AuthError("invalid-token", "GitHub rejected this token."));
      }
      const account = { ...result.account, rememberMe };
      tokens.set(account.id, token);
      accounts.upsert(account);
      accounts.setActive(account.id);
      return Promise.resolve({ ...result, account });
    },
    refresh(accountId) {
      const account = accounts.get(accountId);
      return account === undefined
        ? Promise.reject(new AuthError("invalid-token", "This account is signed out."))
        : Promise.resolve(account);
    },
    signOut(accountId) {
      tokens.delete(accountId);
      accounts.remove(accountId);
    },
    currentToken: (accountId) => Promise.resolve(tokens.get(accountId) ?? null),
  };
}

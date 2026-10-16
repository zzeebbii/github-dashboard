import type { AccountId } from "../../domain/account.ts";

/** The Web Storage key of an account's access ("token") or GitHub App refresh token. */
export const tokenKey = (kind: "token" | "refresh", id: AccountId) => `ghd:${kind}:${id}`;

/**
 * THE ONLY place a token is written (ADR-0016, FR-2.10). Per account:
 * `sessionStorage` by default, `localStorage` with "remember me". Writing to one
 * always clears the other, so a token never lingers where the user did not ask for it.
 *
 * `kind` "refresh" holds GitHub App refresh tokens under the same rule (FR-2.11).
 * `onChange` hears every write and removal (null: everything), so session-sharing.ts can
 * tell the other tabs.
 */
export function createTokenStorage(
  session: Storage = sessionStorage,
  persistent: Storage = localStorage,
  kind: "token" | "refresh" = "token",
  onChange: (id: AccountId | null) => void = () => undefined,
) {
  const key = (id: AccountId) => tokenKey(kind, id);
  return {
    read(id: AccountId): string | null {
      return session.getItem(key(id)) ?? persistent.getItem(key(id));
    },
    write(id: AccountId, token: string, rememberMe: boolean): void {
      (rememberMe ? session : persistent).removeItem(key(id));
      (rememberMe ? persistent : session).setItem(key(id), token);
      onChange(id);
    },
    remove(id: AccountId): void {
      session.removeItem(key(id));
      persistent.removeItem(key(id));
      onChange(id);
    },
    /**
     * "Sign out of everything" (FR-2.9): empties both storages entirely, so the account
     * records, preferences and anything else of this origin go with the tokens.
     */
    clearAll(): void {
      session.clear();
      persistent.clear();
      onChange(null);
    },
  };
}

/**
 * What a 401 removes (FR-2.8): this account's access token AND its GitHub App refresh token,
 * so nothing usable is left behind. The account record stays, for the re-auth prompt.
 */
export function forgetTokens(
  id: AccountId,
  session: Storage = sessionStorage,
  persistent: Storage = localStorage,
): void {
  createTokenStorage(session, persistent, "token").remove(id);
  createTokenStorage(session, persistent, "refresh").remove(id);
}

export type TokenStorage = ReturnType<typeof createTokenStorage>;

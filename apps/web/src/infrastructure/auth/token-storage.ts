import type { AccountId } from "../../domain/account.ts";

/**
 * THE ONLY place a token is written (ADR-0016, FR-2.10). Per account:
 * `sessionStorage` by default, `localStorage` with "remember me". Writing to one
 * always clears the other, so a token never lingers where the user did not ask for it.
 */
const key = (id: AccountId) => `ghd:token:${id}`;

export function createTokenStorage(
  session: Storage = sessionStorage,
  persistent: Storage = localStorage,
) {
  return {
    read(id: AccountId): string | null {
      return session.getItem(key(id)) ?? persistent.getItem(key(id));
    },
    write(id: AccountId, token: string, rememberMe: boolean): void {
      (rememberMe ? session : persistent).removeItem(key(id));
      (rememberMe ? persistent : session).setItem(key(id), token);
    },
    remove(id: AccountId): void {
      session.removeItem(key(id));
      persistent.removeItem(key(id));
    },
  };
}

export type TokenStorage = ReturnType<typeof createTokenStorage>;

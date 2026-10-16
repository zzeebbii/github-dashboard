import type { Query, QueryClient } from "@tanstack/react-query";
import type { Account, AccountId } from "../domain/account.ts";
import type { AuthPort } from "./auth.ts";
import type { CachePort } from "./cache.ts";
import { hydrateQueries } from "./query-hydration.ts";

/** Non-secret account data. Never holds a token (FR-2.10). */
export interface AccountStore {
  list(): readonly Account[];
  get(id: AccountId): Account | undefined;
  /** Inserts, or replaces the account with the same GitHub user id. */
  upsert(account: Account): void;
  /** Also clears the active id if it pointed at this account. */
  remove(id: AccountId): void;
  activeId(): AccountId | null;
  setActive(id: AccountId | null): void;
}

/**
 * Whether an account still has a token. Synchronous on purpose: AuthPort.currentToken may
 * refresh a token (async); this only asks if one is stored. main.tsx wires token storage.
 */
export type HasToken = (id: AccountId) => boolean;

interface AccountActionsDeps {
  readonly auth: AuthPort;
  readonly accounts: AccountStore;
  readonly cache: CachePort;
  readonly queryClient: QueryClient;
  readonly hasToken: HasToken;
  /** Empties localStorage and sessionStorage. */
  readonly clearBrowserStorage: () => void;
  /** `location.reload()` in the app; injected so a test can look at storage afterwards. */
  readonly reload: () => void;
}

/** Query keys are `[store, accountId, ...]` (query-hydration.ts), so index 1 is the owner. */
const ofAccount = (id: AccountId) => ({
  predicate: (query: Query) => query.queryKey[1] === id,
});

/** Switch, remove and sign out of everything (FR-2.6, FR-2.9). */
export function createAccountActions(deps: AccountActionsDeps) {
  const { auth, accounts, cache, queryClient, hasToken } = deps;

  async function switchActive(id: AccountId): Promise<void> {
    // Restore first, so the new account's screens start from its cache, not a spinner.
    await hydrateQueries(queryClient, cache, id, { timeoutMs: 300 });
    accounts.setActive(id);
  }

  return {
    switchActive,

    /** False once the token is gone: a 401 (FR-2.8) or a new session without "remember me". */
    isSignedIn: hasToken,

    /** Deletes the token, the account record and every cached record of this account. */
    async remove(id: AccountId): Promise<void> {
      const wasActive = accounts.activeId() === id;
      await queryClient.cancelQueries(ofAccount(id));
      queryClient.removeQueries(ofAccount(id));
      auth.signOut(id);
      await cache.clearAccount(id);
      if (!wasActive) return;
      const next = accounts.list().find((a) => hasToken(a.id));
      if (next !== undefined) await switchActive(next.id);
    },

    /** Clears localStorage, sessionStorage and the IndexedDB database, then reloads. */
    async signOutEverything(): Promise<void> {
      await queryClient.cancelQueries();
      queryClient.clear();
      deps.clearBrowserStorage();
      await cache.clearAll();
      deps.reload();
    },
  };
}

export type AccountActions = ReturnType<typeof createAccountActions>;

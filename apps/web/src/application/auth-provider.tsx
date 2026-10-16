import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";
import type { Account, AccountId } from "../domain/account.ts";
import type { AccountActions, AccountStore } from "./accounts.ts";
import type { AuthPort, GitHubAppSignInPort, SignInRequest, SignInResult } from "./auth.ts";

interface AuthContextValue {
  readonly signIn: (request: SignInRequest) => Promise<SignInResult>;
  /** null when the deployment has not configured GitHub App sign-in (FR-2.5). */
  readonly githubApp: GitHubAppSignInPort | null;
  readonly signOut: (accountId: AccountId) => void;
  readonly accounts: readonly Account[];
  readonly activeAccount: Account | null;
  readonly actions: AccountActions | undefined;
  readonly refresh: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  readonly auth: AuthPort;
  readonly accountStore: AccountStore;
  readonly githubApp?: GitHubAppSignInPort | null;
  /** Switch, remove and sign out of everything (T10). Screens that do not use them may omit it. */
  readonly actions?: AccountActions;
  readonly children: ReactNode;
}

/** Wires the auth port and account store in; re-reads the store after every change. */
export function AuthProvider({
  auth,
  accountStore,
  githubApp = null,
  actions,
  children,
}: AuthProviderProps) {
  const snapshot = useCallback(
    () => ({ accounts: accountStore.list(), activeId: accountStore.activeId() }),
    [accountStore],
  );
  const [state, setState] = useState(snapshot);
  const queryClient = useQueryClient();
  const refresh = useCallback(() => {
    setState(snapshot());
  }, [snapshot]);

  const signIn = useCallback(
    async (request: SignInRequest) => {
      const result = await auth.signIn(request);
      // Re-auth after a 401: whatever this account fetched before (its errors included) is
      // refetched with the new token. Keys are [store, accountId, ...].
      void queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[1] === result.account.id,
      });
      refresh();
      return result;
    },
    [auth, refresh, queryClient],
  );

  const signOut = useCallback(
    (accountId: AccountId) => {
      auth.signOut(accountId);
      refresh();
    },
    [auth, refresh],
  );

  const app = useMemo(
    () =>
      githubApp === null
        ? null
        : {
            start: () => githubApp.start(),
            complete: async (search: string) => {
              const result = await githubApp.complete(search);
              setState(snapshot());
              return result;
            },
          },
    [githubApp, snapshot],
  );

  const value = useMemo(
    () => ({
      signIn,
      signOut,
      githubApp: app,
      accounts: state.accounts,
      activeAccount: state.accounts.find((a) => a.id === state.activeId) ?? null,
      actions,
      refresh,
    }),
    [signIn, signOut, app, state, actions, refresh],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) throw new Error("useAuth/useAccounts must be used inside <AuthProvider>");
  return context;
}

export function useAuth(): Pick<AuthContextValue, "signIn" | "signOut"> {
  const { signIn, signOut } = useAuthContext();
  return { signIn, signOut };
}

/** The GitHub App web flow, or null when it is not configured. */
export function useGitHubAppSignIn(): GitHubAppSignInPort | null {
  return useAuthContext().githubApp;
}

export function useAccounts(): Pick<AuthContextValue, "accounts" | "activeAccount"> {
  const { accounts, activeAccount } = useAuthContext();
  return { accounts, activeAccount };
}

/** The account actions, each followed by a re-read of the account store. */
export function useAccountActions(): AccountActions {
  const { actions, refresh } = useAuthContext();
  const wrapped = useMemo(
    (): AccountActions | undefined =>
      actions && {
        switchActive: (id) => actions.switchActive(id).finally(refresh),
        isSignedIn: actions.isSignedIn,
        remove: (id) => actions.remove(id).finally(refresh),
        signOutEverything: () => actions.signOutEverything(),
      },
    [actions, refresh],
  );
  if (wrapped === undefined) throw new Error("useAccountActions needs <AuthProvider actions>");
  return wrapped;
}

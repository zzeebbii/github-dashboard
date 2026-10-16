import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";
import type { Account, AccountId } from "../domain/account.ts";
import type { AccountStore } from "./accounts.ts";
import type { AuthPort, GitHubAppSignInPort, SignInRequest, SignInResult } from "./auth.ts";

interface AuthContextValue {
  readonly signIn: (request: SignInRequest) => Promise<SignInResult>;
  /** null when the deployment has not configured GitHub App sign-in (FR-2.5). */
  readonly githubApp: GitHubAppSignInPort | null;
  readonly signOut: (accountId: AccountId) => void;
  readonly accounts: readonly Account[];
  readonly activeAccount: Account | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  readonly auth: AuthPort;
  readonly accountStore: AccountStore;
  readonly githubApp?: GitHubAppSignInPort | null;
  readonly children: ReactNode;
}

/** Wires the auth port and account store in; re-reads the store after every change. */
export function AuthProvider({
  auth,
  accountStore,
  githubApp = null,
  children,
}: AuthProviderProps) {
  const snapshot = useCallback(
    () => ({ accounts: accountStore.list(), activeId: accountStore.activeId() }),
    [accountStore],
  );
  const [state, setState] = useState(snapshot);

  const signIn = useCallback(
    async (request: SignInRequest) => {
      const result = await auth.signIn(request);
      setState(snapshot());
      return result;
    },
    [auth, snapshot],
  );

  const signOut = useCallback(
    (accountId: AccountId) => {
      auth.signOut(accountId);
      setState(snapshot());
    },
    [auth, snapshot],
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
    }),
    [signIn, signOut, app, state],
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

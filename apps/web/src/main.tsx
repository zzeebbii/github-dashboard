// Must stay the first import: it validates the build environment and switches Zod to
// jitless mode before any other module builds a schema (the CSP forbids `new Function`).
import { env } from "./config/env.ts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createAccountActions } from "./application/accounts.ts";
import { AnnouncerProvider } from "./application/announcer.tsx";
import { AuthProvider } from "./application/auth-provider.tsx";
import { GitHubProvider } from "./application/github-provider.tsx";
import { HtmlSanitizerContext } from "./application/html-sanitizer.ts";
import { PreferredI18nProvider } from "./application/i18n.tsx";
import { PreferencesProvider } from "./application/preferences-provider.tsx";
import { hydrateQueries, persistQueries } from "./application/query-hydration.ts";
import { purgeSessionOnlyCaches } from "./application/startup.ts";
import { createUnauthorizedHandler } from "./application/unauthorized.ts";
// Importing the adapter creates the single Trusted Types policy, before anything renders.
import { sanitizeHtml } from "./infrastructure/browser/trusted-types.ts";
import { createGitHubAppAuth } from "./infrastructure/auth/github-app-auth.ts";
import { createPatAuth } from "./infrastructure/auth/pat-auth.ts";
import { createTokenStorage, forgetTokens } from "./infrastructure/auth/token-storage.ts";
import { createLocalAccountStore } from "./infrastructure/local-account-store.ts";
import { createIndexedDbCache } from "./infrastructure/cache/indexeddb-cache.ts";
import { createGitHubClient } from "./infrastructure/github/client.ts";
import { createGitHubRead } from "./infrastructure/github/github-read.ts";
import { createRateLimitTracker } from "./infrastructure/github/rate-limit.ts";
import { createLocalPreferencesStore } from "./infrastructure/local-preferences-store.ts";
import { router } from "./routes/router.tsx";
import type { AccountId } from "./domain/account.ts";
// Self-hosted Geist and Geist Mono (FR-1.2): Vite bundles the woff2 files into dist/assets.
// Imported here rather than via CSS @import so knip sees the dependencies are used.
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./styles.css";

/**
 * The frontend composition root — the single place concrete implementations are
 * chosen. Everything below receives its dependencies through context.
 */

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A failed request that is genuinely broken should surface fast rather
      // than retrying three times behind a spinner.
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

const clock = { now: () => new Date() };
const cache = createIndexedDbCache({ clock });
const tokens = createTokenStorage();
const accountStore = createLocalAccountStore();
const patAuth = createPatAuth({ tokens, accounts: accountStore });
// GitHub App sign-in only when both variables are set (FR-2.5); otherwise PAT alone.
const githubApp =
  env.githubApp === null
    ? null
    : createGitHubAppAuth({
        config: env.githubApp,
        base: patAuth,
        tokens,
        accounts: accountStore,
        clock,
      });
const auth = githubApp ?? patAuth;
// Is a token stored? Sync, unlike auth.currentToken, which may refresh one.
const hasToken = (id: AccountId) => tokens.read(id) !== null;

// Startup, in this order, all before the first render:
// 1. FR-2.13: purge the cache of accounts whose session-only token is gone. It must finish
//    before hydration, or the purged records would be restored into the query client.
// 2. Cache-first (ADR-0017): restore the ACTIVE account's cached query data, waiting at most
//    300 ms; then save every successful fetch.
await purgeSessionOnlyCaches(accountStore, hasToken, cache);
await hydrateQueries(queryClient, cache, accountStore.activeId(), { timeoutMs: 300 });
persistQueries(queryClient, cache);

const github = createGitHubRead(
  createGitHubClient({
    auth,
    cache,
    clock,
    tracker: createRateLimitTracker(clock),
    // FR-2.8: a 401 signs out that account only and asks for a new token for it.
    onUnauthorized: createUnauthorizedHandler({
      accounts: accountStore,
      forgetToken: (id) => {
        forgetTokens(id);
      },
      toSignIn: (account) => void router.navigate({ to: "/sign-in", search: { account } }),
    }),
  }),
);

const accountActions = createAccountActions({
  auth,
  accounts: accountStore,
  cache,
  queryClient,
  hasToken,
  clearBrowserStorage: () => {
    tokens.clearAll();
  },
  reload: () => {
    location.reload();
  },
});

/** The shell needs an active account that still has a token; otherwise, sign in. */
function hasAccount(): boolean {
  const id = accountStore.activeId();
  return id !== null && hasToken(id);
}

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("Root element #root not found in index.html");
}

createRoot(rootElement).render(
  <StrictMode>
    <PreferencesProvider
      store={createLocalPreferencesStore()}
      prefersDark={matchMedia("(prefers-color-scheme: dark)")}
    >
      <PreferredI18nProvider>
        <AnnouncerProvider>
          <QueryClientProvider client={queryClient}>
            <HtmlSanitizerContext value={sanitizeHtml}>
              <AuthProvider
                auth={auth}
                accountStore={accountStore}
                githubApp={githubApp}
                actions={accountActions}
              >
                <GitHubProvider github={github}>
                  <RouterProvider router={router} context={{ hasAccount }} />
                </GitHubProvider>
              </AuthProvider>
            </HtmlSanitizerContext>
          </QueryClientProvider>
        </AnnouncerProvider>
      </PreferredI18nProvider>
    </PreferencesProvider>
  </StrictMode>,
);

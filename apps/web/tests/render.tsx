import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { createAccountActions } from "../src/application/accounts.ts";
import type { AccountStore, HasToken } from "../src/application/accounts.ts";
import type { AuthPort } from "../src/application/auth.ts";
import type { CachePort } from "../src/application/cache.ts";
import { render } from "vitest-browser-react";
import { AnnouncerProvider } from "../src/application/announcer.tsx";
import { AuthProvider } from "../src/application/auth-provider.tsx";
import type { GitHubAppSignInPort } from "../src/application/auth.ts";
import type { GitHubReadPort } from "../src/application/github.ts";
import { GitHubProvider } from "../src/application/github-provider.tsx";
import { HtmlSanitizerContext } from "../src/application/html-sanitizer.ts";
import { PreferredI18nProvider } from "../src/application/i18n.tsx";
import type { PreferencesStore } from "../src/application/preferences.ts";
import { PreferencesProvider } from "../src/application/preferences-provider.tsx";
import type { ColorSchemeQuery } from "../src/application/theme.ts";
import { sanitizeHtml } from "../src/infrastructure/browser/trusted-types.ts";
import { createAppRouter } from "../src/routes/router.tsx";
import { createFakeColorSchemeQuery } from "./fakes/fake-color-scheme-query.ts";
import { createInMemoryAccountStore } from "./fakes/in-memory-account-store.ts";
import { createInMemoryAuth } from "./fakes/in-memory-auth.ts";
import { inMemoryCache } from "./fakes/in-memory-cache.ts";
import { createInMemoryGitHub } from "./fakes/in-memory-github.ts";
import { createInMemoryPreferencesStore } from "./fakes/in-memory-preferences-store.ts";

/**
 * The single entry point for rendering components under test.
 *
 * Wiring providers in one place means a test never fails because someone forgot
 * a provider, and swapping a provider later touches one file rather than fifty.
 */
interface ProviderOptions {
  queryClient?: QueryClient;
  preferencesStore?: PreferencesStore;
  prefersDark?: ColorSchemeQuery;
  github?: GitHubReadPort;
}

export async function renderWithProviders(
  ui: ReactNode,
  {
    queryClient = testQueryClient(),
    preferencesStore = createInMemoryPreferencesStore(),
    prefersDark = createFakeColorSchemeQuery(),
    github = createInMemoryGitHub(),
  }: ProviderOptions = {},
) {
  // `render` is async in vitest-browser-react v2.
  return await render(
    <PreferencesProvider store={preferencesStore} prefersDark={prefersDark}>
      <PreferredI18nProvider>
        <AnnouncerProvider>
          <QueryClientProvider client={queryClient}>
            {/* The real sanitiser: it has no I/O, so there is nothing to fake. */}
            <HtmlSanitizerContext value={sanitizeHtml}>
              <GitHubProvider github={github}>{ui}</GitHubProvider>
            </HtmlSanitizerContext>
          </QueryClientProvider>
        </AnnouncerProvider>
      </PreferredI18nProvider>
    </PreferencesProvider>,
  );
}

interface AppOptions extends ProviderOptions {
  /**
   * The router's context. Given a store, it defaults to what main.tsx does (an active account
   * with a token); without one, to true.
   */
  hasAccount?: boolean;
  accountStore?: AccountStore;
  auth?: AuthPort;
  /** Required with `auth`; defaults to the default fake auth's. */
  hasToken?: HasToken;
  cache?: CachePort;
  clearBrowserStorage?: () => void;
  reload?: () => void;
  githubApp?: GitHubAppSignInPort | null;
}

/**
 * Renders the real route tree at `path` on a memory history, under the same providers plus
 * an in-memory auth (by default one that knows no tokens). Returns the router too, so a test
 * can navigate and go Back.
 */
export async function renderApp(path: string, options: AppOptions = {}) {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
  const accountStore = options.accountStore ?? createInMemoryAccountStore();
  const fakeAuth = createInMemoryAuth(accountStore, {});
  const auth = options.auth ?? fakeAuth;
  const hasToken = options.hasToken ?? fakeAuth.hasToken;
  const queryClient = options.queryClient ?? testQueryClient();
  const actions = createAccountActions({
    auth,
    accounts: accountStore,
    cache: options.cache ?? inMemoryCache({ now: () => new Date() }),
    queryClient,
    hasToken,
    clearBrowserStorage: options.clearBrowserStorage ?? (() => undefined),
    reload: options.reload ?? (() => undefined),
  });
  const fixed = options.hasAccount ?? (options.accountStore === undefined ? true : undefined);
  const hasAccount =
    fixed === undefined
      ? () => {
          const id = accountStore.activeId();
          return id !== null && hasToken(id);
        }
      : () => fixed;
  const screen = await renderWithProviders(
    <AuthProvider
      auth={auth}
      accountStore={accountStore}
      githubApp={options.githubApp ?? null}
      actions={actions}
    >
      <RouterProvider router={router} context={{ hasAccount }} />
    </AuthProvider>,
    { ...options, queryClient },
  );
  return { screen, router, accountStore, auth };
}

/** The QueryClient renderWithProviders uses by default; build one to seed or inspect it. */
export function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      // No retries in tests: a deliberate error assertion should fail fast, not
      // after three backoff cycles.
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

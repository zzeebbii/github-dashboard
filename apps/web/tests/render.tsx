import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { render } from "vitest-browser-react";
import { AnnouncerProvider } from "../src/application/announcer.tsx";
import { AuthProvider } from "../src/application/auth-provider.tsx";
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

/**
 * Renders the real route tree at `path` on a memory history, under the same providers plus
 * an in-memory auth that knows no tokens. Returns the router too, so a test can navigate and
 * go Back.
 */
export async function renderApp(
  path: string,
  { hasAccount = true, ...options }: ProviderOptions & { hasAccount?: boolean } = {},
) {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
  const accountStore = createInMemoryAccountStore();
  const screen = await renderWithProviders(
    <AuthProvider auth={createInMemoryAuth(accountStore, {})} accountStore={accountStore}>
      <RouterProvider router={router} context={{ hasAccount: () => hasAccount }} />
    </AuthProvider>,
    options,
  );
  return { screen, router };
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

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { render } from "vitest-browser-react";
import { HtmlSanitizerContext } from "../src/application/html-sanitizer.ts";
import type { PreferencesStore } from "../src/application/preferences.ts";
import { PreferencesProvider } from "../src/application/preferences-provider.tsx";
import type { ColorSchemeQuery } from "../src/application/theme.ts";
import { sanitizeHtml } from "../src/infrastructure/browser/trusted-types.ts";
import { createFakeColorSchemeQuery } from "./fakes/fake-color-scheme-query.ts";
import { createInMemoryPreferencesStore } from "./fakes/in-memory-preferences-store.ts";

/**
 * The single entry point for rendering components under test.
 *
 * Wiring providers in one place means a test never fails because someone forgot
 * a provider, and swapping a provider later touches one file rather than fifty.
 */
export async function renderWithProviders(
  ui: ReactNode,
  {
    queryClient = testQueryClient(),
    preferencesStore = createInMemoryPreferencesStore(),
    prefersDark = createFakeColorSchemeQuery(),
  }: {
    queryClient?: QueryClient;
    preferencesStore?: PreferencesStore;
    prefersDark?: ColorSchemeQuery;
  } = {},
) {
  // `render` is async in vitest-browser-react v2.
  return await render(
    <PreferencesProvider store={preferencesStore} prefersDark={prefersDark}>
      <QueryClientProvider client={queryClient}>
        {/* The real sanitiser: it has no I/O, so there is nothing to fake. */}
        <HtmlSanitizerContext value={sanitizeHtml}>{ui}</HtmlSanitizerContext>
      </QueryClientProvider>
    </PreferencesProvider>,
  );
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

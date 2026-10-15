// Must stay the first import: it validates the build environment and switches Zod to
// jitless mode before any other module builds a schema (the CSP forbids `new Function`).
import "./config/env.ts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "./application/auth-provider.tsx";
import { HtmlSanitizerContext } from "./application/html-sanitizer.ts";
import { PreferencesProvider } from "./application/preferences-provider.tsx";
import { hydrateQueries, persistQueries } from "./application/query-hydration.ts";
// Importing the adapter creates the single Trusted Types policy, before anything renders.
import { sanitizeHtml } from "./infrastructure/browser/trusted-types.ts";
import { createPatAuth } from "./infrastructure/auth/pat-auth.ts";
import { createTokenStorage } from "./infrastructure/auth/token-storage.ts";
import { createLocalAccountStore } from "./infrastructure/local-account-store.ts";
import { createIndexedDbCache } from "./infrastructure/cache/indexeddb-cache.ts";
import { createLocalPreferencesStore } from "./infrastructure/local-preferences-store.ts";
import { router } from "./routes/router.tsx";
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

// Cache-first (ADR-0017): restore cached query data before the first render, but never
// wait more than 300 ms for it; then save every successful fetch.
const clock = { now: () => new Date() };
const cache = createIndexedDbCache({ clock });
await hydrateQueries(queryClient, cache, { timeoutMs: 300 });
persistQueries(queryClient, cache);

const accountStore = createLocalAccountStore();
const auth = createPatAuth({ tokens: createTokenStorage(), accounts: accountStore });

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
      <QueryClientProvider client={queryClient}>
        <HtmlSanitizerContext value={sanitizeHtml}>
          <AuthProvider auth={auth} accountStore={accountStore}>
            <RouterProvider
              router={router}
              context={{ hasAccount: () => accountStore.activeId() !== null }}
            />
          </AuthProvider>
        </HtmlSanitizerContext>
      </QueryClientProvider>
    </PreferencesProvider>
  </StrictMode>,
);

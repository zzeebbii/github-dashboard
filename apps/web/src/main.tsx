// Must stay the first import: it validates the build environment and switches Zod to
// jitless mode before any other module builds a schema (the CSP forbids `new Function`).
import "./config/env.ts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HtmlSanitizerContext } from "./application/html-sanitizer.ts";
// Importing the adapter creates the single Trusted Types policy, before anything renders.
import { sanitizeHtml } from "./infrastructure/browser/trusted-types.ts";
import { hydrateQueries, persistQueries } from "./application/query-hydration.ts";
import { createIndexedDbCache } from "./infrastructure/cache/indexeddb-cache.ts";
import { router } from "./routes/router.tsx";
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
const cache = createIndexedDbCache({ clock: { now: () => new Date() } });
await hydrateQueries(queryClient, cache, { timeoutMs: 300 });
persistQueries(queryClient, cache);

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("Root element #root not found in index.html");
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <HtmlSanitizerContext value={sanitizeHtml}>
        <RouterProvider router={router} />
      </HtmlSanitizerContext>
    </QueryClientProvider>
  </StrictMode>,
);

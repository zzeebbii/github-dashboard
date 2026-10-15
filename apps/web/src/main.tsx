import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HtmlSanitizerContext } from "./application/html-sanitizer.ts";
// Imported for its side effect: validates the build environment before render.
import "./config/env.ts";
// Importing the adapter creates the single Trusted Types policy, before anything renders.
import { sanitizeHtml } from "./infrastructure/browser/trusted-types.ts";
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

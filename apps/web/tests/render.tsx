import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { render } from "vitest-browser-react";
import { HtmlSanitizerContext } from "../src/application/html-sanitizer.ts";
import { sanitizeHtml } from "../src/infrastructure/browser/trusted-types.ts";

/**
 * The single entry point for rendering components under test.
 *
 * Wiring providers in one place means a test never fails because someone forgot
 * a provider, and swapping a provider later touches one file rather than fifty.
 */
export async function renderWithProviders(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      // No retries in tests: a deliberate error assertion should fail fast, not
      // after three backoff cycles.
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });

  // `render` is async in vitest-browser-react v2.
  return await render(
    <QueryClientProvider client={queryClient}>
      {/* The real sanitiser: it has no I/O, so there is nothing to fake. */}
      <HtmlSanitizerContext value={sanitizeHtml}>{ui}</HtmlSanitizerContext>
    </QueryClientProvider>,
  );
}

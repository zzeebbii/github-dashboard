import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { render } from "vitest-browser-react";
import { TaskApiProvider } from "../src/application/api-provider.tsx";
import type { TaskApi } from "../src/application/ports.ts";

/**
 * The single entry point for rendering components under test.
 *
 * Wiring providers in one place means a test never fails because someone forgot
 * a provider, and swapping a provider later touches one file rather than fifty.
 */
export async function renderWithProviders(ui: ReactNode, options: { api: TaskApi }) {
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
      <TaskApiProvider api={options.api}>{ui}</TaskApiProvider>
    </QueryClientProvider>,
  );
}

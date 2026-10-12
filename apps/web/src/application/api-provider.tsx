import { createContext, useContext, type ReactNode } from "react";
import type { TaskApi } from "./ports.ts";

/**
 * The frontend's composition seam.
 *
 * Components resolve the TaskApi port from context instead of importing a
 * concrete client. Production wires the HTTP adapter; tests wire an in-memory
 * fake. Neither the components nor the hooks change between the two.
 */

const TaskApiContext = createContext<TaskApi | undefined>(undefined);

export function TaskApiProvider({ api, children }: { api: TaskApi; children: ReactNode }) {
  return <TaskApiContext value={api}>{children}</TaskApiContext>;
}

export function useTaskApi(): TaskApi {
  const api = useContext(TaskApiContext);

  if (api === undefined) {
    throw new Error(
      "useTaskApi must be used inside <TaskApiProvider>. In tests, use renderWithProviders() from tests/render.tsx.",
    );
  }
  return api;
}

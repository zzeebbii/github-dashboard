import { createContext, type ReactNode, useContext, useSyncExternalStore } from "react";
import type { RefreshScheduler, RefreshState } from "./refresh-scheduler.ts";

const RefreshContext = createContext<RefreshScheduler | null>(null);

/** main.tsx wires and starts the scheduler; tests build one from tests/fakes. */
export function RefreshProvider({
  scheduler,
  children,
}: {
  readonly scheduler: RefreshScheduler;
  readonly children: ReactNode;
}) {
  return <RefreshContext value={scheduler}>{children}</RefreshContext>;
}

export function useRefreshScheduler(): RefreshScheduler {
  const scheduler = useContext(RefreshContext);
  if (scheduler === null) {
    throw new Error(
      "useRefreshScheduler must be used inside <RefreshProvider>. In tests, use renderWithProviders() from tests/render.tsx.",
    );
  }
  return scheduler;
}

export function useRefreshState(): RefreshState {
  const scheduler = useRefreshScheduler();
  return useSyncExternalStore(scheduler.subscribe, scheduler.getState);
}

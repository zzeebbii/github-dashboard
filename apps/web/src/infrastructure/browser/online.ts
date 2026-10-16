import type { PageSignal } from "../../application/refresh-scheduler.ts";

/** `navigator.onLine`, with the `online` and `offline` events (FR-3.11). */
export function networkStatus(): PageSignal {
  return {
    current: () => navigator.onLine,
    subscribe(listener) {
      window.addEventListener("online", listener);
      window.addEventListener("offline", listener);
      return () => {
        window.removeEventListener("online", listener);
        window.removeEventListener("offline", listener);
      };
    },
  };
}

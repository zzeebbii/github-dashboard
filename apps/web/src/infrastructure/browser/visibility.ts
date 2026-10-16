import type { PageSignal } from "../../application/refresh-scheduler.ts";

/** Whether the page is visible; fires on `visibilitychange` and on window `focus` (FR-3.7). */
export function pageVisibility(): PageSignal {
  return {
    current: () => document.visibilityState === "visible",
    subscribe(listener) {
      document.addEventListener("visibilitychange", listener);
      window.addEventListener("focus", listener);
      return () => {
        document.removeEventListener("visibilitychange", listener);
        window.removeEventListener("focus", listener);
      };
    },
  };
}

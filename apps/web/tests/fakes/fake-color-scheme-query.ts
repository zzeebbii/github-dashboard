import type { ColorSchemeQuery } from "../../src/application/theme.ts";

/** A `prefers-color-scheme: dark` query whose OS setting a test can flip. */
export function createFakeColorSchemeQuery(prefersDark = false) {
  const target = new EventTarget();
  const query = {
    matches: prefersDark,
    addEventListener: (type: "change", listener: () => void) => {
      target.addEventListener(type, listener);
    },
    removeEventListener: (type: "change", listener: () => void) => {
      target.removeEventListener(type, listener);
    },
    /** Simulates the user switching the OS colour scheme. */
    setPrefersDark(next: boolean) {
      query.matches = next;
      target.dispatchEvent(new Event("change"));
    },
  } satisfies ColorSchemeQuery & { setPrefersDark(next: boolean): void };
  return query;
}

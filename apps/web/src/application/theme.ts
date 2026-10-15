import type { Theme } from "./preferences.ts";

export type ResolvedTheme = "light" | "dark";

/**
 * The slice of `MediaQueryList` theme resolution needs. Production passes
 * `matchMedia("(prefers-color-scheme: dark)")`; tests pass a fake.
 */
export interface ColorSchemeQuery {
  readonly matches: boolean;
  addEventListener(type: "change", listener: () => void): void;
  removeEventListener(type: "change", listener: () => void): void;
}

export function resolveTheme(theme: Theme, prefersDark: ColorSchemeQuery): ResolvedTheme {
  if (theme !== "system") {
    return theme;
  }
  return prefersDark.matches ? "dark" : "light";
}

/** Calls `onChange` whenever the OS colour scheme flips. Returns the unsubscribe function. */
export function subscribeToColorScheme(
  prefersDark: ColorSchemeQuery,
  onChange: () => void,
): () => void {
  prefersDark.addEventListener("change", onChange);
  return () => {
    prefersDark.removeEventListener("change", onChange);
  };
}

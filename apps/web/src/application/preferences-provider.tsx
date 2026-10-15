import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { Preferences, PreferencesStore } from "./preferences.ts";
import {
  resolveTheme,
  subscribeToColorScheme,
  type ColorSchemeQuery,
  type ResolvedTheme,
} from "./theme.ts";

/**
 * The preferences composition seam. Production wires the localStorage adapter and the real
 * `prefers-color-scheme` query; tests wire in-memory fakes.
 *
 * The provider also keeps `html.dark` in step with the resolved theme. public/theme-init.js
 * sets it before first paint; from then on this owns it, including live OS changes under
 * "system" (AC-1.1).
 */

interface PreferencesContextValue {
  readonly preferences: Preferences;
  readonly resolvedTheme: ResolvedTheme;
  readonly updatePreferences: (changes: Partial<Preferences>) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | undefined>(undefined);

export function PreferencesProvider({
  store,
  prefersDark,
  children,
}: {
  store: PreferencesStore;
  prefersDark: ColorSchemeQuery;
  children: ReactNode;
}) {
  const [preferences, setPreferences] = useState(() => store.load());

  const subscribe = useCallback(
    (onChange: () => void) => subscribeToColorScheme(prefersDark, onChange),
    [prefersDark],
  );
  const resolvedTheme = useSyncExternalStore(subscribe, () =>
    resolveTheme(preferences.theme, prefersDark),
  );

  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  }, [resolvedTheme]);

  const updatePreferences = useCallback(
    (changes: Partial<Preferences>) => {
      const next = { ...preferences, ...changes };
      store.save(next);
      setPreferences(next);
    },
    [preferences, store],
  );

  const value = useMemo(
    () => ({ preferences, resolvedTheme, updatePreferences }),
    [preferences, resolvedTheme, updatePreferences],
  );

  return <PreferencesContext value={value}>{children}</PreferencesContext>;
}

export function usePreferences(): PreferencesContextValue {
  const value = useContext(PreferencesContext);

  if (value === undefined) {
    throw new Error(
      "usePreferences must be used inside <PreferencesProvider>. In tests, use renderWithProviders() from tests/render.tsx.",
    );
  }
  return value;
}

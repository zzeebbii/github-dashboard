import { z } from "zod";
import {
  defaultPreferences,
  type Density,
  type Language,
  type Preferences,
  type PreferencesStore,
  type Theme,
} from "../application/preferences.ts";

/**
 * Preferences persisted in localStorage as JSON under one key.
 *
 * public/theme-init.js reads this key and its `theme` field before first paint, so a change to
 * either must be made there too.
 */
const STORAGE_KEY = "ghd:preferences";

// Each field falls back on its own, so one bad value does not discard the others.
// `satisfies` keeps every listed value a member of the port's type.
const PreferencesSchema = z.object({
  theme: z
    .enum(["light", "dark", "system"] as const satisfies readonly Theme[])
    .catch(defaultPreferences.theme),
  density: z
    .enum(["comfortable", "compact"] as const satisfies readonly Density[])
    .catch(defaultPreferences.density),
  language: z
    .enum(["en", "fi", "sv"] as const satisfies readonly Language[])
    .catch(defaultPreferences.language),
});

function readStored(storage: Storage): unknown {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw === null ? {} : JSON.parse(raw);
  } catch {
    // Corrupt JSON, or storage denied (privacy mode): use the defaults.
    return {};
  }
}

export function createLocalPreferencesStore(storage: Storage = localStorage): PreferencesStore {
  return {
    load(): Preferences {
      const parsed = PreferencesSchema.safeParse(readStored(storage));
      return parsed.success ? parsed.data : defaultPreferences;
    },
    save(preferences: Preferences): void {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(preferences));
      } catch {
        // Quota exceeded or storage denied: the preference still applies for this session.
      }
    },
  };
}

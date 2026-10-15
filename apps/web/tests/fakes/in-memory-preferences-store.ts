import {
  defaultPreferences,
  type Preferences,
  type PreferencesStore,
} from "../../src/application/preferences.ts";

/** A PreferencesStore that outlives a component tree, so a test can remount against it. */
export function createInMemoryPreferencesStore(
  initial: Preferences = defaultPreferences,
): PreferencesStore {
  let stored = initial;
  return {
    load: () => stored,
    save: (preferences) => {
      stored = preferences;
    },
  };
}

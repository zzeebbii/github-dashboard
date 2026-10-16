import { beforeEach, expect, test } from "vitest";
import { defaultPreferences } from "../application/preferences.ts";
import { createLocalPreferencesStore } from "./local-preferences-store.ts";

const KEY = "ghd:preferences";

beforeEach(() => {
  localStorage.clear();
});

test("nothing stored loads the defaults", () => {
  expect(createLocalPreferencesStore().load()).toEqual(defaultPreferences);
});

test("saved preferences load back", () => {
  const store = createLocalPreferencesStore();
  const preferences = {
    theme: "dark",
    density: "compact",
    language: "fi",
    listShortcutsEnabled: false,
  } as const;

  store.save(preferences);

  expect(createLocalPreferencesStore().load()).toEqual(preferences);
  // public/theme-init.js depends on this key and shape.
  expect(JSON.parse(localStorage.getItem(KEY) ?? "")).toMatchObject({ theme: "dark" });
});

test.each(["{not json", "null", "42", '"dark"', "[]"])(
  "corrupt stored value %s falls back to the defaults",
  (raw) => {
    localStorage.setItem(KEY, raw);

    expect(createLocalPreferencesStore().load()).toEqual(defaultPreferences);
  },
);

test("an invalid field falls back alone, keeping the valid ones", () => {
  localStorage.setItem(KEY, JSON.stringify({ theme: "sepia", density: "compact", language: 3 }));

  expect(createLocalPreferencesStore().load()).toEqual({
    theme: "system",
    density: "compact",
    language: "en",
    listShortcutsEnabled: true,
  });
});

test("preferences saved before the J/K toggle existed load, with the toggle on", () => {
  localStorage.setItem(KEY, JSON.stringify({ theme: "dark", density: "compact", language: "sv" }));

  expect(createLocalPreferencesStore().load()).toEqual({
    theme: "dark",
    density: "compact",
    language: "sv",
    listShortcutsEnabled: true,
  });
});

test("storage that throws neither breaks load nor save", () => {
  const broken = {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  } as unknown as Storage;
  const store = createLocalPreferencesStore(broken);

  expect(store.load()).toEqual(defaultPreferences);
  expect(() => {
    store.save(defaultPreferences);
  }).not.toThrow();
});

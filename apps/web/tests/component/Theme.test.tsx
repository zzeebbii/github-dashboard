import { afterEach, expect, test } from "vitest";
import { usePreferences } from "../../src/application/preferences-provider.tsx";
import { createFakeColorSchemeQuery } from "../fakes/fake-color-scheme-query.ts";
import { createInMemoryPreferencesStore } from "../fakes/in-memory-preferences-store.ts";
import { renderWithProviders } from "../render.tsx";

/** Stand-in for the header quick toggle (T8), driving the provider the same way. */
function ThemeToggle() {
  const { resolvedTheme, updatePreferences } = usePreferences();
  return (
    <button
      type="button"
      onClick={() => {
        updatePreferences({ theme: resolvedTheme === "dark" ? "light" : "dark" });
      }}
    >
      Toggle theme
    </button>
  );
}

const isDark = () => document.documentElement.classList.contains("dark");

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

test("the toggle switches html.dark and the choice survives a remount", async () => {
  const preferencesStore = createInMemoryPreferencesStore();
  const first = await renderWithProviders(<ThemeToggle />, { preferencesStore });
  expect(isDark()).toBe(false);

  await first.getByRole("button", { name: "Toggle theme" }).click();
  await expect.poll(isDark).toBe(true);

  await first.unmount();
  await renderWithProviders(<ThemeToggle />, { preferencesStore });
  expect(isDark()).toBe(true);
  expect(preferencesStore.load().theme).toBe("dark");
});

test("system renders dark when the OS is dark and follows it live (AC-1.1)", async () => {
  const prefersDark = createFakeColorSchemeQuery(true);
  await renderWithProviders(<ThemeToggle />, { prefersDark });
  expect(isDark()).toBe(true);

  prefersDark.setPrefersDark(false);
  await expect.poll(isDark).toBe(false);
});

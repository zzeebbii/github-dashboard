import { afterEach, expect, test } from "vitest";
import { SettingsPage } from "../../src/features/settings/SettingsPage.tsx";
import { createInMemoryPreferencesStore } from "../fakes/in-memory-preferences-store.ts";
import { expectNoAxeViolations } from "../axe.ts";
import { renderWithProviders } from "../render.tsx";

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

test("choosing Suomi translates the page and survives a reload (AC-1.2)", async () => {
  const preferencesStore = createInMemoryPreferencesStore();
  const first = await renderWithProviders(<SettingsPage />, { preferencesStore });

  await first.getByRole("radio", { name: "Suomi" }).click();

  await expect.element(first.getByRole("heading", { name: "Asetukset" })).toBeVisible();
  expect(document.documentElement.lang).toBe("fi");

  // A reload: a fresh tree over the same store.
  await first.unmount();
  document.documentElement.lang = "";
  const second = await renderWithProviders(<SettingsPage />, { preferencesStore });
  await expect.element(second.getByRole("heading", { name: "Asetukset" })).toBeVisible();
  await expect.element(second.getByRole("radio", { name: "Suomi" })).toBeChecked();
  expect(document.documentElement.lang).toBe("fi");
});

test("theme and density choices are saved", async () => {
  const preferencesStore = createInMemoryPreferencesStore();
  const screen = await renderWithProviders(<SettingsPage />, { preferencesStore });
  await expect.element(screen.getByRole("radio", { name: "Match system" })).toBeChecked();

  await screen.getByRole("radio", { name: "Dark" }).click();
  await screen.getByRole("radio", { name: "Compact" }).click();

  await expect.poll(() => document.documentElement.classList.contains("dark")).toBe(true);
  expect(preferencesStore.load()).toMatchObject({ theme: "dark", density: "compact" });
});

test("the settings page has no axe violations in either theme", async () => {
  const screen = await renderWithProviders(<SettingsPage />);

  await expectNoAxeViolations(screen.container);
});

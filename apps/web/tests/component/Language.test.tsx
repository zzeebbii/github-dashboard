import { useState } from "react";
import { expect, test } from "vitest";
import { I18nProvider, type Language, useI18n, useT } from "../../src/application/i18n.tsx";
import { renderWithProviders } from "../render.tsx";

function Probe() {
  const t = useT();
  const { setLanguage } = useI18n();
  return (
    <>
      <h1>{t("settings")}</h1>
      <button type="button" onClick={() => setLanguage("fi")}>
        Suomi
      </button>
    </>
  );
}

// The test owns the language state, standing in for the preferences store. Persistence across
// reload is covered once T8 wires the provider to PreferencesStore.
function Harness() {
  const [language, setLanguage] = useState<Language>("en");
  return (
    <I18nProvider language={language} onLanguageChange={setLanguage}>
      <Probe />
    </I18nProvider>
  );
}

test("switching to Suomi translates the text and sets <html lang> without reload", async () => {
  const screen = await renderWithProviders(<Harness />);
  await expect.element(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
  expect(document.documentElement.lang).toBe("en");

  await screen.getByRole("button", { name: "Suomi" }).click();

  await expect.element(screen.getByRole("heading", { name: "Asetukset" })).toBeInTheDocument();
  expect(document.documentElement.lang).toBe("fi");
});

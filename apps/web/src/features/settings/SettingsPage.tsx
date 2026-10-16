import { languageNames, languages, useI18n } from "../../application/i18n.tsx";
import { usePreferences } from "../../application/preferences-provider.tsx";
import { RadioGroup } from "../../ui/RadioGroup.tsx";

/**
 * `/settings`: theme, language and density, saved through PreferencesStore (FR-1.3, FR-1.8).
 * Only settings that exist today; T26 adds the J/K shortcut toggle.
 */
export function SettingsPage() {
  const { t, language, setLanguage } = useI18n();
  const { preferences, updatePreferences } = usePreferences();

  return (
    <>
      <h1>{t("settings")}</h1>
      <RadioGroup
        legend={t("theme")}
        name="theme"
        value={preferences.theme}
        options={[
          { value: "light", label: t("themeLight") },
          { value: "dark", label: t("themeDark") },
          { value: "system", label: t("themeSystem") },
        ]}
        onChange={(theme) => {
          updatePreferences({ theme });
        }}
      />
      <RadioGroup
        legend={t("language")}
        name="language"
        value={language}
        options={languages.map((code) => ({ value: code, label: languageNames[code], lang: code }))}
        onChange={setLanguage}
      />
      <RadioGroup
        legend={t("density")}
        name="density"
        value={preferences.density}
        options={[
          { value: "comfortable", label: t("densityComfortable") },
          { value: "compact", label: t("densityCompact") },
        ]}
        onChange={(density) => {
          updatePreferences({ density });
        }}
      />
    </>
  );
}

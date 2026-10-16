import { useId } from "react";
import { languageNames, languages } from "../application/i18n.tsx";
import type { Language } from "../application/preferences.ts";

/** The compact language picker of the sidebar footer and the sign-in page. */
export function LanguageSelect({
  label,
  language,
  onChange,
}: {
  readonly label: string;
  readonly language: Language;
  readonly onChange: (language: Language) => void;
}) {
  const id = useId();
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        className="language-select"
        value={language}
        onChange={(event) => {
          const next = languages.find((code) => code === event.target.value);
          if (next !== undefined) onChange(next);
        }}
      >
        {languages.map((code) => (
          <option key={code} value={code} lang={code}>
            {languageNames[code]}
          </option>
        ))}
      </select>
    </>
  );
}

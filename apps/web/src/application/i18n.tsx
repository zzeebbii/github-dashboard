import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo } from "react";
import { type Catalogue, en, type MessageKey, type Plural } from "../i18n/en.ts";
import { fi } from "../i18n/fi.ts";
import { sv } from "../i18n/sv.ts";
import type { Language } from "./preferences.ts";
import { usePreferences } from "./preferences-provider.tsx";

type Messages = Partial<Catalogue>;
type Params = Readonly<Record<string, string | number>>;

const catalogues: Record<Language, Messages> = { en, fi, sv };

const pluralRules = new Map<Language, Intl.PluralRules>();

/** The form of `message` for `n`, by the language's CLDR plural rules; `other` without `n`. */
function pluralForm(language: Language, message: string | Plural, n: unknown): string {
  if (typeof message === "string") return message;
  if (typeof n !== "number") return message.other;
  let rules = pluralRules.get(language);
  if (rules === undefined) {
    rules = new Intl.PluralRules(language);
    pluralRules.set(language, rules);
  }
  return message[rules.select(n)] ?? message.other;
}

/**
 * Looks `key` up in `messages`, falling back to English, and fills `{name}` placeholders.
 * A plural entry picks its form from the `n` param. Numbers are formatted for `language`.
 */
export function translate(
  language: Language,
  messages: Messages,
  key: MessageKey,
  params: Params = {},
): string {
  const template = pluralForm(language, messages[key] ?? en[key], params["n"]);
  const number = new Intl.NumberFormat(language);
  return template.replace(/\{(\w+)\}/gu, (placeholder, name: string) => {
    const value = params[name];
    if (value === undefined) return placeholder;
    return typeof value === "number" ? number.format(value) : value;
  });
}

const HOUR = 3_600_000;

const unitOf = (language: Language, value: number, unit: "minute" | "second") =>
  new Intl.NumberFormat(language, { style: "unit", unit, unitDisplay: "narrow" }).format(value);

/** `Intl` formatters for one language. Time is always passed in, never read from a clock. */
export function createFormat(language: Language) {
  return {
    /**
     * How long ago `date` was, relative to `now`, with the design's `ago()` thresholds:
     * under an hour in minutes, under a day in hours, under two weeks in days, else weeks.
     */
    relative(date: Date, now: Date): string {
      const rtf = new Intl.RelativeTimeFormat(language, { numeric: "auto", style: "short" });
      const hours = (now.getTime() - date.getTime()) / HOUR;
      if (hours < 1) return rtf.format(-Math.round(hours * 60), "minute");
      if (hours < 24) return rtf.format(-Math.round(hours), "hour");
      if (hours < 336) return rtf.format(-Math.round(hours / 24), "day");
      return rtf.format(-Math.round(hours / 168), "week");
    },
    number(value: number): string {
      return new Intl.NumberFormat(language).format(value);
    },
    date(value: Date, options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }): string {
      return new Intl.DateTimeFormat(language, options).format(value);
    },
    /** A short duration such as "2m 5s" (a check run). Intl.DurationFormat is not in ES2023. */
    duration(ms: number): string {
      const seconds = Math.round(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      return minutes === 0
        ? unitOf(language, seconds, "second")
        : `${unitOf(language, minutes, "minute")} ${unitOf(language, seconds % 60, "second")}`;
    },
  };
}

/** What `useT()` returns. `ui/` components that show fixed copy take it as a `t` prop. */
export type Translate = (key: MessageKey, params?: Params) => string;

/** Each language named in itself, so a reader finds theirs whatever the current language. */
export const languageNames: Readonly<Record<Language, string>> = {
  en: "English",
  fi: "Suomi",
  sv: "Svenska",
};
export const languages: readonly Language[] = ["en", "fi", "sv"];

interface I18n {
  readonly language: Language;
  readonly setLanguage: (language: Language) => void;
  readonly t: Translate;
  readonly format: ReturnType<typeof createFormat>;
}

const I18nContext = createContext<I18n | undefined>(undefined);

/**
 * Controlled: the caller owns the language (and persists it), this provider renders it.
 * Keeps `<html lang>` in step so screen readers and hyphenation follow the choice.
 */
export function I18nProvider({
  language,
  onLanguageChange,
  children,
}: {
  language: Language;
  onLanguageChange: (language: Language) => void;
  children: ReactNode;
}) {
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<I18n>(
    () => ({
      language,
      setLanguage: onLanguageChange,
      t: (key, params) => translate(language, catalogues[language], key, params),
      format: createFormat(language),
    }),
    [language, onLanguageChange],
  );

  return <I18nContext value={value}>{children}</I18nContext>;
}

/** I18nProvider driven by the stored preference, so the choice survives a reload (AC-1.2). */
export function PreferredI18nProvider({ children }: { children: ReactNode }) {
  const { preferences, updatePreferences } = usePreferences();
  const onLanguageChange = useCallback(
    (language: Language) => {
      updatePreferences({ language });
    },
    [updatePreferences],
  );
  return (
    <I18nProvider language={preferences.language} onLanguageChange={onLanguageChange}>
      {children}
    </I18nProvider>
  );
}

export function useI18n(): I18n {
  const i18n = useContext(I18nContext);
  if (i18n === undefined) throw new Error("useI18n must be used inside <I18nProvider>.");
  return i18n;
}

/** The translate function for the active language. GitHub content never goes through it. */
export function useT(): I18n["t"] {
  return useI18n().t;
}

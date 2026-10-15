import { createContext, type ReactNode, useContext, useEffect, useMemo } from "react";
import { en, type MessageKey } from "../i18n/en.ts";
import { fi } from "../i18n/fi.ts";
import { sv } from "../i18n/sv.ts";

// ponytail: duplicated in application/preferences.ts (T6); T8 makes this import that one.
export type Language = "en" | "fi" | "sv";

type Messages = Partial<Record<MessageKey, string>>;
type Params = Readonly<Record<string, string | number>>;

const catalogues: Record<Language, Messages> = { en, fi, sv };

/**
 * Looks `key` up in `messages`, falling back to English, and fills `{name}` placeholders.
 * Numbers are formatted for `language`.
 */
export function translate(
  language: Language,
  messages: Messages,
  key: MessageKey,
  params: Params = {},
): string {
  const template = messages[key] ?? en[key];
  const number = new Intl.NumberFormat(language);
  return template.replace(/\{(\w+)\}/gu, (placeholder, name: string) => {
    const value = params[name];
    if (value === undefined) return placeholder;
    return typeof value === "number" ? number.format(value) : value;
  });
}

const HOUR = 3_600_000;

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
  };
}

interface I18n {
  readonly language: Language;
  readonly setLanguage: (language: Language) => void;
  readonly t: (key: MessageKey, params?: Params) => string;
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

export function useI18n(): I18n {
  const i18n = useContext(I18nContext);
  if (i18n === undefined) throw new Error("useI18n must be used inside <I18nProvider>.");
  return i18n;
}

/** The translate function for the active language. GitHub content never goes through it. */
export function useT(): I18n["t"] {
  return useI18n().t;
}

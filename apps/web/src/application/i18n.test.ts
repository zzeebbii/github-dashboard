import { describe, expect, test } from "vitest";
import { en } from "../i18n/en.ts";
import { fi } from "../i18n/fi.ts";
import { sv } from "../i18n/sv.ts";
import { createFormat, translate } from "./i18n.tsx";

describe("translate", () => {
  test("uses the active catalogue", () => {
    expect(translate("fi", fi, "settings")).toBe("Asetukset");
  });

  test("falls back to English when a key is missing", () => {
    const { settings: _missing, ...partial } = fi;
    expect(translate("fi", partial, "settings")).toBe("Settings");
  });

  test("fills placeholders, formatting numbers for the language", () => {
    expect(translate("fi", fi, "qLeft", { n: 4180 })).toBe("4 180 jäljellä");
  });
});

const repos = (n: number) => translate("en", en, "homeRepos", { n });

describe("plurals follow Intl.PluralRules on the n param", () => {
  test.each([
    ["en", en, 0, "0 results"],
    ["en", en, 1, "1 result"],
    ["en", en, 2, "2 results"],
    ["en", en, 1000, "1,000 results"],
    ["fi", fi, 0, "0 tulosta"],
    ["fi", fi, 1, "1 tulos"],
    ["fi", fi, 2, "2 tulosta"],
    ["fi", fi, 1000, "1 000 tulosta"],
    ["sv", sv, 0, "0 träffar"],
    ["sv", sv, 1, "1 träff"],
    ["sv", sv, 2, "2 träffar"],
    ["sv", sv, 1000, "1 000 träffar"],
  ] as const)("%s n=%i", (language, messages, n, expected) => {
    const key = language === "sv" ? "sb_matches" : "pa_results";
    // Intl formats fi/sv thousands with a no-break space.
    expect(translate(language, messages, key, { n }).replace(/ /gu, " ")).toBe(expected);
  });

  test("formats the number for the language", () => {
    expect(translate("fi", fi, "sb_openPrs", { n: 1234 }).replace(/ /gu, " ")).toBe(
      "1 234 avointa pull requestia",
    );
  });

  test("falls back to the English plural when a Finnish one is missing", () => {
    const { pa_results: _missing, ...partial } = fi;
    expect(translate("fi", partial, "pa_results", { n: 1 })).toBe("1 result");
    expect(translate("fi", partial, "pa_results", { n: 3 })).toBe("3 results");
  });

  test("uses other when n is not passed", () => {
    expect(translate("en", en, "pa_results")).toBe("{n} results");
  });

  test("a plural message can nest another", () => {
    expect(translate("en", en, "homeSub", { n: 1, repos: repos(1) })).toBe(
      "1 needs your action across 1 repository",
    );
    expect(translate("en", en, "homeSub", { n: 3, repos: repos(2) })).toBe(
      "3 need your action across 2 repositories",
    );
  });
});

describe("format.relative uses the design's thresholds", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);
  const relative = (hours: number) => createFormat("en").relative(hoursAgo(hours), now);

  test.each([
    [0, "this minute"],
    [0.5, "30 min. ago"],
    [1, "1 hr. ago"],
    [23, "23 hr. ago"],
    [24, "yesterday"],
    [13 * 24, "13 days ago"],
    [14 * 24, "2 wk. ago"],
  ])("%sh ago → %s", (hours, expected) => {
    expect(relative(hours)).toBe(expected);
  });

  test("speaks the active language", () => {
    expect(createFormat("sv").relative(hoursAgo(3), now)).toBe("för 3 tim sedan");
  });
});

test("format.number and format.date use the active language", () => {
  const format = createFormat("fi");
  expect(format.number(1234.5)).toBe("1 234,5");
  expect(
    format.date(new Date("2026-10-15T12:00:00Z"), { dateStyle: "short", timeZone: "UTC" }),
  ).toBe("15.10.2026");
});

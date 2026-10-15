import { describe, expect, test } from "vitest";
import { fi } from "../i18n/fi.ts";
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
    expect(translate("en", {}, "homeSub", { n: 3, r: 2 })).toBe(
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

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const css = readFileSync(resolve(import.meta.dirname, "../styles.css"), "utf8");

/**
 * AC-1.5: every token pair the design uses for text meets WCAG AA. The values are read from
 * the real styles.css, so a token edit that breaks contrast fails here.
 */

function tokens(selector: string): Record<string, string> {
  const block = new RegExp(`${selector.replace(".", "\\.")}\\{([^}]*)\\}`, "u").exec(css)?.[1];
  if (block === undefined) throw new Error(`No ${selector} block in styles.css`);
  const palette: Record<string, string> = {};
  for (const [, name, hex] of block.matchAll(/--([\w-]+):(#[0-9a-f]{6})/gu)) {
    if (name !== undefined && hex !== undefined) palette[name] = hex;
  }
  return palette;
}

function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.040_45 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].toSorted((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

const surfaces = ["background", "card", "popover", "sidebar", "subtle"];

/** Body text: 4.5:1. */
const textPairs: [string, string][] = [
  ...surfaces.map((bg): [string, string] => ["foreground", bg]),
  ["foreground", "muted"],
  ["foreground", "accent"],
  ...surfaces.map((bg): [string, string] => ["muted-foreground", bg]),
  ["primary-foreground", "primary"],
  ...["red", "amber", "blue", "purple"].map((fg): [string, string] => [fg, "background"]),
];

/**
 * Icons, focus rings and status dots: 3:1. Light-theme green (3.3:1 on white) and
 * muted-foreground on muted/accent (4.4:1) are only good enough for these, never for text.
 */
const nonTextPairs: [string, string][] = [
  ...["green", "red", "amber", "blue", "purple"].flatMap((fg) =>
    surfaces.map((bg): [string, string] => [fg, bg]),
  ),
  ["muted-foreground", "muted"],
  ["muted-foreground", "accent"],
  ["foreground", "background"],
];

describe.each([
  ["light", tokens(":root")],
  ["dark", tokens("html.dark")],
])("%s theme", (_theme, palette) => {
  const ratio = (fg: string, bg: string) => {
    const [a, b] = [palette[fg], palette[bg]];
    if (a === undefined || b === undefined) throw new Error(`Missing token --${fg} or --${bg}`);
    return contrast(a, b);
  };

  test.each(textPairs)("text %s on %s is at least 4.5:1", (fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  test.each(nonTextPairs)("icon %s on %s is at least 3:1", (fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(3);
  });
});

test("the contrast formula matches WCAG's reference values", () => {
  expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
  expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
});

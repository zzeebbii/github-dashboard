import { expect, test } from "vitest";
import { createFakeColorSchemeQuery } from "../../tests/fakes/fake-color-scheme-query.ts";
import { resolveTheme, subscribeToColorScheme } from "./theme.ts";

test("an explicit theme ignores the OS colour scheme", () => {
  const prefersDark = createFakeColorSchemeQuery(true);

  expect(resolveTheme("light", prefersDark)).toBe("light");
  expect(resolveTheme("dark", createFakeColorSchemeQuery(false))).toBe("dark");
});

test("system resolves from the media query and follows its change event", () => {
  const prefersDark = createFakeColorSchemeQuery(true);
  const seen: string[] = [];
  const unsubscribe = subscribeToColorScheme(prefersDark, () => {
    seen.push(resolveTheme("system", prefersDark));
  });

  expect(resolveTheme("system", prefersDark)).toBe("dark");
  prefersDark.setPrefersDark(false);
  expect(seen).toEqual(["light"]);

  unsubscribe();
  prefersDark.setPrefersDark(true);
  expect(seen).toEqual(["light"]);
});

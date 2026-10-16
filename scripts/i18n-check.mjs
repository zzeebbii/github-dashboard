#!/usr/bin/env node
/**
 * Fails when a translation catalogue lacks a key English has, has a key English lacks,
 * has a plural entry without `other`, or drops a `{placeholder}` English uses.
 * Node strips the catalogues' TypeScript types natively, so no loader is needed.
 *
 * Usage:  pnpm i18n:check
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const catalogueDir = resolve(import.meta.dirname, "../apps/web/src/i18n");
const translations = ["fi", "sv"];

const load = async (language) =>
  (await import(pathToFileURL(resolve(catalogueDir, `${language}.ts`)).href))[language];

/** A value's forms: one for a string, one per CLDR category for a plural object. */
const formsOf = (value) => (typeof value === "string" ? { "": value } : value);
const placeholdersOf = (text) => Array.from(text.matchAll(/\{(\w+)\}/gu), (m) => m[1]);

const [source, ...catalogues] = await Promise.all(["en", ...translations].map(load));
const sourceKeys = new Set(Object.keys(source));
let problems = 0;
const problem = (message) => {
  console.error(message);
  problems += 1;
};

for (const [language, catalogue] of [
  ["en", source],
  ...translations.map((l, i) => [l, catalogues[i]]),
]) {
  for (const [key, value] of Object.entries(catalogue)) {
    if (typeof value !== "string" && typeof value?.other !== "string") {
      problem(`${language}.ts plural "${key}" has no "other" form`);
    }
  }
}

translations.forEach((language, index) => {
  const catalogue = catalogues[index];
  const keys = new Set(Object.keys(catalogue));
  for (const key of sourceKeys.difference(keys)) problem(`${language}.ts is missing key "${key}"`);
  for (const key of keys.difference(sourceKeys)) {
    problem(`${language}.ts has extra key "${key}" that en.ts does not`);
  }
  for (const key of sourceKeys.intersection(keys)) {
    const expected = new Set(Object.values(formsOf(source[key])).flatMap(placeholdersOf));
    for (const [form, text] of Object.entries(formsOf(catalogue[key]))) {
      for (const name of expected.difference(new Set(placeholdersOf(text)))) {
        problem(`${language}.ts "${key}"${form && `.${form}`} lacks placeholder "{${name}}"`);
      }
    }
  }
});

if (problems > 0) {
  console.error(`\n✖ ${problems} catalogue problem(s). en.ts is the source of truth.`);
  process.exit(1);
}
console.log(`✔ ${translations.join(" and ")} match the ${sourceKeys.size} English keys.`);

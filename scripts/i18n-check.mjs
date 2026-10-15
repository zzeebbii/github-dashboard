#!/usr/bin/env node
/**
 * Fails when a translation catalogue lacks a key English has, or has a key English lacks.
 * Node strips the catalogues' TypeScript types natively, so no loader is needed.
 *
 * Usage:  pnpm i18n:check
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const catalogueDir = resolve(import.meta.dirname, "../apps/web/src/i18n");
const translations = ["fi", "sv"];

const load = async (language) =>
  new Set(
    Object.keys(
      (await import(pathToFileURL(resolve(catalogueDir, `${language}.ts`)).href))[language],
    ),
  );

const [source, ...catalogues] = await Promise.all(["en", ...translations].map(load));
let problems = 0;

translations.forEach((language, index) => {
  const keys = catalogues[index];
  for (const key of source.difference(keys)) {
    console.error(`${language}.ts is missing key "${key}"`);
    problems += 1;
  }
  for (const key of keys.difference(source)) {
    console.error(`${language}.ts has extra key "${key}" that en.ts does not`);
    problems += 1;
  }
});

if (problems > 0) {
  console.error(`\n✖ ${problems} catalogue problem(s). en.ts is the source of truth.`);
  process.exit(1);
}
console.log(`✔ ${translations.join(" and ")} match the ${source.size} English keys.`);

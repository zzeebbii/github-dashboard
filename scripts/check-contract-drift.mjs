#!/usr/bin/env node
/**
 * Fails if artifacts/openapi.json differs from what the contract currently
 * produces.
 *
 * This is the gate that makes the committed spec trustworthy: it cannot silently
 * drift from the Zod schemas that generate it, so a .NET or Go implementation
 * reading that file is reading the truth.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const specPath = resolve(repoRoot, "artifacts/openapi.json");

function fail(message) {
  console.error(`\n✖ Contract drift check failed.\n\n${message}\n`);
  process.exit(1);
}

let committed;
try {
  committed = readFileSync(specPath, "utf8");
} catch {
  fail(
    `artifacts/openapi.json does not exist.\n` +
      `Run:  pnpm contract:generate    then commit the result.`,
  );
}

// Regenerate into memory by running the generator, then re-reading the file.
try {
  execFileSync("pnpm", ["--filter", "@kit/api", "run", "contract:generate"], {
    cwd: repoRoot,
    stdio: "pipe",
  });
} catch (error) {
  fail(`Could not regenerate the OpenAPI document:\n${error.stdout ?? ""}${error.stderr ?? ""}`);
}

const regenerated = readFileSync(specPath, "utf8");

if (regenerated !== committed) {
  fail(
    `artifacts/openapi.json is out of date with packages/contracts.\n\n` +
      `You changed a schema without regenerating the published contract.\n\n` +
      `Fix:\n` +
      `  pnpm contract:generate\n` +
      `  git add artifacts/openapi.json\n\n` +
      `Then check whether the change is BREAKING (removed field, narrowed type,\n` +
      `new required field). If it is, mark the commit accordingly and add an ADR.\n` +
      `See docs/guides/adding-a-feature.md.`,
  );
}

console.log("✔ artifacts/openapi.json matches the contract.");

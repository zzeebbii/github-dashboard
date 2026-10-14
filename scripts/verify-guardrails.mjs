#!/usr/bin/env node
/**
 * Proves the guardrails actually fire.
 *
 * Every check in `pnpm verify` is supposed to BLOCK a specific mistake. This
 * script introduces each of those mistakes on purpose and asserts the relevant
 * check fails. A guardrail that has never been observed failing is not known to
 * work — dependency-cruiser, for example, once reported success while silently
 * cruising zero modules (see ADR-0013).
 *
 * Every mutation is reverted, including on crash or Ctrl-C.
 *
 * Usage:  node scripts/verify-guardrails.mjs [--only <substring>]
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");

/** Files currently mutated, so we can always put them back. */
const backups = new Map();

function snapshot(relativePaths) {
  for (const relativePath of relativePaths) {
    const absolute = resolve(repoRoot, relativePath);
    if (!backups.has(absolute)) {
      backups.set(absolute, readFileSync(absolute, "utf8"));
    }
  }
}

function restoreAll() {
  for (const [absolute, original] of backups) {
    writeFileSync(absolute, original, "utf8");
  }
  backups.clear();
}

process.on("SIGINT", () => {
  restoreAll();
  process.exit(130);
});

function mutate(relativePath, transform) {
  const absolute = resolve(repoRoot, relativePath);
  writeFileSync(absolute, transform(readFileSync(absolute, "utf8")), "utf8");
}

/** Runs a command and reports whether it FAILED (which is what we want here). */
function commandFails(command) {
  try {
    execSync(command, { cwd: repoRoot, stdio: "pipe" });
    return false;
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// The scenarios. Each one is a mistake an agent could plausibly make.
// ---------------------------------------------------------------------------
// Scenarios that mutated the removed backend and contracts are gone; the SPA
// guardrail scenarios are rebuilt alongside the rewritten rule sets.
const scenarios = [
  {
    name: "`any` is rejected",
    guards: "pnpm lint",
    touches: ["apps/web/src/features/home/HomePage.tsx"],
    apply: () =>
      mutate(
        "apps/web/src/features/home/HomePage.tsx",
        (source) => `export const sloppy = (value: any): any => value;\n${source}`,
      ),
  },
  {
    name: "an unused export is caught",
    guards: "pnpm exec knip",
    touches: ["apps/web/src/features/home/HomePage.tsx"],
    apply: () =>
      mutate(
        "apps/web/src/features/home/HomePage.tsx",
        (source) => `export const neverUsedAnywhere = 42;\n${source}`,
      ),
  },
];

// ---------------------------------------------------------------------------
const only = process.argv.includes("--only")
  ? process.argv[process.argv.indexOf("--only") + 1]
  : undefined;

const selected = only === undefined ? scenarios : scenarios.filter((s) => s.name.includes(only));

console.log(`Verifying ${selected.length} guardrail(s). Each SHOULD fail its check.\n`);

let failures = 0;

try {
  for (const scenario of selected) {
    snapshot(scenario.touches);
    process.stdout.write(`  ${scenario.name} ... `);

    try {
      scenario.before?.();
      scenario.apply();

      if (commandFails(scenario.guards)) {
        console.log(`blocked by \`${scenario.guards}\` ✔`);
      } else {
        console.log(`NOT BLOCKED ✖  (\`${scenario.guards}\` passed but should have failed)`);
        failures += 1;
      }
    } finally {
      restoreAll();
    }
  }
} finally {
  restoreAll();
}

if (failures > 0) {
  console.error(
    `\n✖ ${failures} guardrail(s) did not fire.\n\n` +
      `A check that passes while the rule is violated is worse than no check: it\n` +
      `reports safety that does not exist. Fix the check, not this script.\n`,
  );
  process.exit(1);
}

console.log(`\n✔ All ${selected.length} guardrails fired as intended.`);

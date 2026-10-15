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
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");

/** Files currently mutated, so we can always put them back. */
const backups = new Map();
/** Files (or the first new directory above them) created by a scenario, removed on restore. */
const created = new Set();

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
  for (const absolute of created) {
    rmSync(absolute, { recursive: true, force: true });
  }
  created.clear();
}

process.on("SIGINT", () => {
  restoreAll();
  process.exit(130);
});

function mutate(relativePath, transform) {
  const absolute = resolve(repoRoot, relativePath);
  writeFileSync(absolute, transform(readFileSync(absolute, "utf8")), "utf8");
}

/** Prepends code to an existing file. */
function prepend(relativePath, code) {
  mutate(relativePath, (source) => `${code}\n${source}`);
}

/**
 * Creates a file in a layer that has no source yet. The file, and any directory
 * this call had to create, are deleted on restore.
 */
function create(relativePath, content) {
  const absolute = resolve(repoRoot, relativePath);
  const firstNewDirectory = mkdirSync(dirname(absolute), { recursive: true });
  created.add(firstNewDirectory ?? absolute);
  writeFileSync(absolute, content, "utf8");
}

/**
 * Runs a command and reports whether it FAILED (which is what we want here).
 * The failure only counts if the output names `expect` (the rule), so a scenario
 * cannot pass because some unrelated check happened to trip.
 */
function commandFails(command, expect) {
  try {
    execSync(command, { cwd: repoRoot, stdio: "pipe" });
    return false;
  } catch (error) {
    return `${error.stdout}${error.stderr}`.includes(expect);
  }
}

// ---------------------------------------------------------------------------
// The scenarios. Each one is a mistake an agent could plausibly make.
// ---------------------------------------------------------------------------
// `touches` lists existing files to snapshot; files a scenario `create`s are
// removed on restore. `expect` is the rule name the failing check must report.
const home = "apps/web/src/features/home/HomePage.tsx";
const domain = "apps/web/src/domain/sort.ts";

/** A lint scenario that prepends `code` to the Home feature file. */
const lintInFeatures = (name, code, expect) => ({
  name,
  guards: "pnpm lint",
  expect,
  touches: [home],
  apply: () => prepend(home, code),
});

const scenarios = [
  // dependency-cruiser: layering.
  {
    name: "domain importing React is rejected",
    guards: "pnpm arch:check",
    expect: "web-domain-is-pure",
    touches: [domain],
    apply: () => prepend(domain, 'import "react";'),
  },
  {
    name: "domain importing Zod is rejected",
    guards: "pnpm arch:check",
    expect: "web-domain-no-zod",
    touches: [domain],
    apply: () => prepend(domain, 'import "zod";'),
  },
  {
    // No application/ or infrastructure/ source exists yet, so both ends are created.
    name: "application importing infrastructure is rejected",
    guards: "pnpm arch:check",
    expect: "web-application-no-infrastructure",
    touches: [],
    apply: () => {
      create("apps/web/src/infrastructure/guardrail-probe.ts", "export const probe = 1;\n");
      create(
        "apps/web/src/application/guardrail-probe.ts",
        'import { probe } from "../infrastructure/guardrail-probe.ts";\nexport const used = probe;\n',
      );
    },
  },
  {
    name: "ui importing features is rejected",
    guards: "pnpm arch:check",
    expect: "web-ui-is-presentational",
    touches: [],
    apply: () =>
      create(
        "apps/web/src/ui/GuardrailProbe.tsx",
        'import { HomePage } from "../features/home/HomePage.tsx";\nexport const Probe = HomePage;\n',
      ),
  },

  // oxlint: network, storage and raw HTML outside infrastructure/.
  lintInFeatures(
    "`fetch(` in features/ is rejected",
    'export const probe = () => fetch("/x");',
    "no-restricted-globals",
  ),
  {
    name: "`localStorage` in application/ is rejected",
    guards: "pnpm lint",
    expect: "no-restricted-globals",
    touches: [],
    apply: () =>
      create(
        "apps/web/src/application/guardrail-probe.ts",
        'export const probe = () => localStorage.getItem("token");\n',
      ),
  },
  lintInFeatures(
    "`navigator.locks` in features/ is rejected",
    "export const probe = () => navigator.locks;",
    "no-restricted-properties",
  ),
  lintInFeatures(
    "`innerHTML` in features/ is rejected",
    'export const probe = (el: HTMLElement) => { el.innerHTML = "x"; };',
    "no-restricted-properties",
  ),
  lintInFeatures(
    "`dangerouslySetInnerHTML` in features/ is rejected",
    'export const Probe = () => <div dangerouslySetInnerHTML={{ __html: "x" }} />;',
    "no-danger",
  ),
  lintInFeatures("`eval` is rejected", 'export const probe = () => eval("1");', "no-eval"),
  lintInFeatures(
    "`new Function` is rejected",
    'export const probe = () => new Function("return 1");',
    "no-new-func",
  ),
  lintInFeatures(
    "`outerHTML` in features/ is rejected",
    'export const probe = (el: HTMLElement) => { el.outerHTML = "x"; };',
    "no-restricted-properties",
  ),
  lintInFeatures(
    "`insertAdjacentHTML` in features/ is rejected",
    'export const probe = (el: HTMLElement) => { el.insertAdjacentHTML("beforeend", "x"); };',
    "no-restricted-properties",
  ),
  lintInFeatures(
    "`document.write` in features/ is rejected",
    'export const probe = () => { document.write("x"); };',
    "no-restricted-properties",
  ),
  lintInFeatures(
    "`setTimeout` with a code string is rejected",
    'export const probe = () => setTimeout("alert(1)", 1);',
    "no-implied-eval",
  ),

  // oxlint: type-aware hygiene.
  lintInFeatures("a floating promise is rejected", "Promise.resolve();", "no-floating-promises"),
  lintInFeatures(
    "`any` is rejected",
    "export const sloppy = (value: any): any => value;",
    "no-explicit-any",
  ),

  // i18n catalogues.
  {
    name: "a key missing from sv.ts is caught",
    guards: "pnpm i18n:check",
    expect: 'missing key "kSearch"',
    touches: ["apps/web/src/i18n/sv.ts"],
    apply: () =>
      mutate("apps/web/src/i18n/sv.ts", (source) => source.replace(/^ {2}kSearch:.*\n/mu, "")),
  },

  // knip.
  {
    name: "an unused export is caught",
    guards: "pnpm exec knip",
    expect: "neverUsedAnywhere",
    touches: [home],
    apply: () => prepend(home, "export const neverUsedAnywhere = 42;"),
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

      if (commandFails(scenario.guards, scenario.expect)) {
        console.log(`blocked by \`${scenario.guards}\` (${scenario.expect}) ✔`);
      } else {
        console.log(
          `NOT BLOCKED ✖  (\`${scenario.guards}\` did not fail with \`${scenario.expect}\`)`,
        );
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

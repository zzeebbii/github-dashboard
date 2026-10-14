#!/usr/bin/env node
/**
 * Turns a fresh copy of the starter kit into a new project. Run it once, right
 * after creating a repository from the template:
 *
 *   pnpm init-project my-dashboard --owner @your-github-user [--title "My Dashboard"]
 *
 * Renames the @kit/* workspace scope, the root package, the Compose project, and
 * the human-readable title; points CODEOWNERS at the new project; resets the
 * changelog; then regenerates the lockfile. The script deletes itself at the end,
 * because a project is initialised exactly once.
 *
 * It refuses to run on a dirty working tree, so `git checkout .` undoes it.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

const repoRoot = resolve(import.meta.dirname, "..");
const selfPath = "scripts/init-project.mjs";
const usage = 'Usage: pnpm init-project <name> --owner @github-user-or-org/team [--title "Title"]';

function fail(message) {
  console.error(`\n✖ ${message}\n\n${usage}\n`);
  process.exit(1);
}

function run(command, args, stdio = "inherit") {
  return execFileSync(command, args, { cwd: repoRoot, encoding: "utf8", stdio });
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    owner: { type: "string" },
    title: { type: "string" },
  },
});

const name = positionals[0] ?? "";
// Must be valid as an npm scope, a package name, and a Compose project name.
if (!/^[a-z][a-z0-9-]*$/u.test(name)) {
  fail(`Project name must be lowercase kebab-case, e.g. "my-dashboard". Got "${name}".`);
}
const owner = values.owner ?? "";
if (!/^@[\w.-]+(\/[\w.-]+)?$/u.test(owner)) {
  fail(`--owner must be a GitHub user or team for CODEOWNERS, e.g. "@octocat". Got "${owner}".`);
}
const title =
  values.title ??
  name.replace(/(^|-)([a-z0-9])/gu, (_, dash, c) => `${dash ? " " : ""}${c.toUpperCase()}`);

if (!readFileSync(resolve(repoRoot, "apps/web/package.json"), "utf8").includes('"@kit/')) {
  fail("This project is already initialised: no @kit/* packages remain.");
}
if (run("git", ["status", "--porcelain"], "pipe").trim() !== "") {
  fail(
    "The working tree has uncommitted changes. Commit or stash them first, so the result is reviewable and `git checkout .` undoes it.",
  );
}

// Order matters: longer, more specific strings first.
const replacements = [
  ["@your-org/maintainers", owner],
  ["agentic-fullstack-starter-kit", name],
  ["agentic-kit", name],
  ["Agentic Fullstack Starter Kit", title],
  ["@kit/", `@${name}/`],
];

const skip = new Set([selfPath]);
const files = run("git", ["ls-files", "-z"], "pipe")
  .split("\0")
  .filter((file) => file !== "" && !skip.has(file));

let changed = 0;
for (const file of files) {
  const path = resolve(repoRoot, file);
  const original = readFileSync(path, "utf8");
  if (original.includes("\0")) continue; // binary
  const updated = replacements.reduce((text, [from, to]) => text.replaceAll(from, to), original);
  if (updated !== original) {
    writeFileSync(path, updated, "utf8");
    changed += 1;
  }
}

// The template instructions are done once this has run.
const readmePath = resolve(repoRoot, "README.md");
writeFileSync(
  readmePath,
  readFileSync(readmePath, "utf8").replace(/## Using this as a template\n[\s\S]*?(?=\n## )/u, ""),
  "utf8",
);

// A new project starts with an empty history; the generator appends below the marker.
const changelogPath = resolve(repoRoot, "CHANGELOG.md");
const marker = "<!-- newest-first -->";
writeFileSync(
  changelogPath,
  `${readFileSync(changelogPath, "utf8").split(marker)[0]}${marker}\n`,
  "utf8",
);

const packageJsonPath = resolve(repoRoot, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
delete packageJson.scripts["init-project"];
writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
rmSync(resolve(repoRoot, selfPath));

console.log(`\nRenamed the kit to "${name}" in ${changed} files. Regenerating derived files…\n`);
run("pnpm", ["install"]);
// Renames change column widths in Markdown tables; let the formatter realign them.
run("pnpm", ["run", "format"]);

console.log(`
✔ Initialised "${title}".

Next:
  1. Review the result:  git status && git diff
  2. Run the full gate:  pnpm verify
  3. Commit:             git add -A && git commit -m "chore: initialise ${name} from the starter kit"
`);

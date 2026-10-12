#!/usr/bin/env node
/**
 * Generates CHANGELOG.md entries from Conventional Commits, in Keep a Changelog
 * format.
 *
 * Nothing to remember and nothing to merge-conflict over: the commit messages
 * are the source, and they are already validated by commitlint.
 *
 * Usage:  pnpm changelog [fromRef] [toRef]
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const changelogPath = resolve(repoRoot, "CHANGELOG.md");

function git(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: "pipe" }).trim();
}

const lastTag = (() => {
  try {
    return git(["describe", "--tags", "--abbrev=0"]);
  } catch {
    return null;
  }
})();

const fromRef = process.argv[2] ?? lastTag;
const toRef = process.argv[3] ?? "HEAD";
const range = fromRef === null ? toRef : `${fromRef}..${toRef}`;

// %H|%s|%b with a record separator that will not appear in a commit message.
const raw = git(["log", range, "--pretty=format:%H%x1f%s%x1f%b%x1e", "--no-merges"]);

const SECTIONS = {
  feat: "Added",
  fix: "Fixed",
  perf: "Changed",
  refactor: "Changed",
  revert: "Removed",
  docs: "Documentation",
  build: "Changed",
  ci: "Changed",
};

const grouped = new Map();
const breakingChanges = [];

for (const record of raw.split("\x1e")) {
  const trimmed = record.trim();
  if (trimmed === "") continue;

  const [hash, subject, body] = trimmed.split("\x1f");
  const match = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<bang>!)?:\s*(?<description>.+)$/u.exec(
    subject ?? "",
  );
  if (match?.groups === undefined) continue;

  const { type, scope, bang, description } = match.groups;
  const isBreaking = bang === "!" || /BREAKING[ -]CHANGE/u.test(body ?? "");
  const shortHash = (hash ?? "").slice(0, 7);
  const entry = `${scope === undefined ? "" : `**${scope}:** `}${description} (${shortHash})`;

  if (isBreaking) {
    breakingChanges.push(entry);
    continue;
  }

  const section = SECTIONS[type ?? ""];
  // chore/test/style are intentionally omitted: they are not user-facing.
  if (section === undefined) continue;

  const list = grouped.get(section) ?? [];
  list.push(entry);
  grouped.set(section, list);
}

if (grouped.size === 0 && breakingChanges.length === 0) {
  console.log(`No user-facing changes in ${range}.`);
  process.exit(0);
}

const date = new Date().toISOString().slice(0, 10);
const lines = [`## [Unreleased] - ${date}`, ""];

if (breakingChanges.length > 0) {
  lines.push("### ⚠ BREAKING CHANGES", "");
  for (const entry of breakingChanges) lines.push(`- ${entry}`);
  lines.push("");
}

for (const section of ["Added", "Changed", "Fixed", "Removed", "Documentation"]) {
  const entries = grouped.get(section);
  if (entries === undefined) continue;
  lines.push(`### ${section}`, "");
  for (const entry of entries) lines.push(`- ${entry}`);
  lines.push("");
}

const existing = readFileSync(changelogPath, "utf8");
const marker = "<!-- newest-first -->";
const [header, ...rest] = existing.split(marker);

writeFileSync(
  changelogPath,
  `${header}${marker}\n\n${lines.join("\n")}${rest.join(marker).replace(/^\n+/u, "\n")}`,
  "utf8",
);

console.log(`Updated CHANGELOG.md from ${range}.`);

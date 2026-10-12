#!/usr/bin/env node
/**
 * Scaffolds the next ADR from the template.
 *
 * Usage:  pnpm adr:new "Use Drizzle behind repository ports"
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const adrDir = resolve(repoRoot, "docs/adr");

const title = process.argv.slice(2).join(" ").trim();
if (title === "") {
  console.error('Usage: pnpm adr:new "Short decision title"');
  process.exit(1);
}

const existing = readdirSync(adrDir).filter((name) => /^\d{4}-.*\.md$/u.test(name));
const nextNumber = String(
  existing.reduce((max, name) => Math.max(max, Number(name.slice(0, 4))), 0) + 1,
).padStart(4, "0");

const slug = title
  .toLowerCase()
  .replace(/[^a-z0-9]+/gu, "-")
  .replace(/^-|-$/gu, "");

const fileName = `${nextNumber}-${slug}.md`;
const template = readFileSync(resolve(adrDir, "template.md"), "utf8");

const content = template
  .replace("# ADR-NNNN: Title", `# ADR-${nextNumber}: ${title}`)
  .replace("**Status:** Proposed", "**Status:** Proposed")
  .replace("**Date:** YYYY-MM-DD", `**Date:** ${new Date().toISOString().slice(0, 10)}`);

writeFileSync(resolve(adrDir, fileName), content, "utf8");
console.log(`Created docs/adr/${fileName}`);
console.log(
  "Fill in Context, Decision, Consequences, and Alternatives, then commit it with the change.",
);

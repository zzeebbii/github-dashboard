#!/usr/bin/env node
/**
 * Checks the local environment BEFORE anything fails confusingly downstream.
 *
 * A missing Docker daemon should say "Docker is not running", not surface as an
 * opaque failure halfway through starting the prod-like stack.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const problems = [];
const notes = [];

function tryRun(command, args) {
  try {
    return execFileSync(command, args, { encoding: "utf8", stdio: "pipe" }).trim();
  } catch {
    return null;
  }
}

// --- Node --------------------------------------------------------------------
const requiredMajor = Number(readFileSync(resolve(repoRoot, ".nvmrc"), "utf8").trim());
const actualMajor = Number(process.versions.node.split(".")[0]);

if (actualMajor !== requiredMajor) {
  problems.push(
    `Node ${requiredMajor}.x is required (found ${process.versions.node}).\n` +
      `      This repo pins Node via .nvmrc, package.json engines, and the Docker\n` +
      `      base image so local, CI, and production agree.\n` +
      `      Fix: nvm use   (or install Node ${requiredMajor})`,
  );
}

// --- pnpm --------------------------------------------------------------------
const pnpmVersion = tryRun("pnpm", ["--version"]);
if (pnpmVersion === null) {
  problems.push(
    `pnpm is not installed.\n` +
      `      Fix: corepack enable && corepack prepare pnpm@11.22.0 --activate`,
  );
} else if (Number(pnpmVersion.split(".")[0]) < 11) {
  problems.push(
    `pnpm 11+ is required (found ${pnpmVersion}). Fix: corepack prepare pnpm@11.22.0 --activate`,
  );
}

// --- Docker ------------------------------------------------------------------
if (tryRun("docker", ["--version"]) === null) {
  problems.push(
    `Docker is not installed.\n` +
      `      It is required for the local stack and E2E.\n` +
      `      See docs/guides/local-development.md.`,
  );
} else if (tryRun("docker", ["info", "--format", "{{.ServerVersion}}"]) === null) {
  problems.push(`Docker is installed but the daemon is not running. Fix: start Docker Desktop.`);
}

// --- Environment file --------------------------------------------------------
if (!existsSync(resolve(repoRoot, ".env"))) {
  notes.push("No .env found. Copy .env.example only if you need to override build variables.");
}

// --- Report ------------------------------------------------------------------
for (const note of notes) console.log(`  note  ${note}`);

if (problems.length > 0) {
  console.error(`\n✖ Preflight found ${problems.length} problem(s):\n`);
  for (const problem of problems) console.error(`  ✖  ${problem}\n`);
  process.exit(1);
}

console.log(`✔ Preflight OK — Node ${process.versions.node}, pnpm ${pnpmVersion}, Docker running.`);

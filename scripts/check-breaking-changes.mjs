#!/usr/bin/env node
/**
 * Classifies contract changes against a base git ref as breaking / additive /
 * none, and fails when a breaking change is not declared.
 *
 * A self-contained structural diff of the OpenAPI document is used rather than
 * an external service, so the check runs offline and identically on a laptop and
 * in CI.
 *
 * Usage:  node scripts/check-breaking-changes.mjs [baseRef]   (default: origin/main)
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const specRelPath = "artifacts/openapi.json";
const baseRef = process.argv[2] ?? process.env["BASE_REF"] ?? "origin/main";

function git(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: "pipe" });
}

/** Reads the spec as it exists at `ref`, or null when it did not exist there. */
function readSpecAt(ref) {
  try {
    return JSON.parse(git(["show", `${ref}:${specRelPath}`]));
  } catch {
    return null;
  }
}

/** Flattens a JSON Schema into a map of pointer → {type, required}. */
function flattenSchema(schema, prefix = "") {
  const out = new Map();
  if (schema === null || typeof schema !== "object") return out;

  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  const properties = schema.properties ?? {};

  for (const [name, value] of Object.entries(properties)) {
    const pointer = `${prefix}/${name}`;
    out.set(pointer, {
      type: JSON.stringify(value.type ?? value.$ref ?? value.anyOf ?? value.enum ?? "unknown"),
      required: required.has(name),
    });
    for (const [nested, meta] of flattenSchema(value, pointer)) {
      out.set(nested, meta);
    }
  }

  if (schema.items !== undefined) {
    for (const [nested, meta] of flattenSchema(schema.items, `${prefix}/items`)) {
      out.set(nested, meta);
    }
  }
  return out;
}

function collectOperations(spec) {
  const operations = new Map();
  for (const [path, methods] of Object.entries(spec.paths ?? {})) {
    for (const [method, operation] of Object.entries(methods)) {
      operations.set(`${method.toUpperCase()} ${path}`, operation);
    }
  }
  return operations;
}

const breaking = [];
const additive = [];

const base = readSpecAt(baseRef);

if (base === null) {
  console.log(`No ${specRelPath} at ${baseRef} — treating every endpoint as new.`);
  process.exit(0);
}

const head = JSON.parse(readFileSync(resolve(repoRoot, specRelPath), "utf8"));
const baseOps = collectOperations(base);
const headOps = collectOperations(head);

// --- removed or renamed endpoints ---------------------------------------
for (const key of baseOps.keys()) {
  if (!headOps.has(key)) breaking.push(`Endpoint removed: ${key}`);
}
for (const key of headOps.keys()) {
  if (!baseOps.has(key)) additive.push(`Endpoint added: ${key}`);
}

for (const [key, headOp] of headOps) {
  const baseOp = baseOps.get(key);
  if (baseOp === undefined) continue;

  // --- responses --------------------------------------------------------
  for (const status of Object.keys(baseOp.responses ?? {})) {
    if (headOp.responses?.[status] === undefined) {
      breaking.push(`${key}: response ${status} removed`);
      continue;
    }

    const baseSchema = baseOp.responses[status]?.content?.["application/json"]?.schema;
    const headSchema = headOp.responses[status]?.content?.["application/json"]?.schema;
    if (baseSchema === undefined || headSchema === undefined) continue;

    const before = flattenSchema(baseSchema);
    const after = flattenSchema(headSchema);

    for (const [pointer, meta] of before) {
      const now = after.get(pointer);
      if (now === undefined) {
        // Consumers may already read this field.
        breaking.push(`${key}: response ${status} field removed: ${pointer}`);
      } else if (now.type !== meta.type) {
        breaking.push(`${key}: response ${status} field type changed: ${pointer}`);
      }
    }
    for (const pointer of after.keys()) {
      if (!before.has(pointer)) additive.push(`${key}: response ${status} field added: ${pointer}`);
    }
  }

  // --- request bodies ---------------------------------------------------
  const baseBody = baseOp.requestBody?.content?.["application/json"]?.schema;
  const headBody = headOp.requestBody?.content?.["application/json"]?.schema;
  if (baseBody !== undefined && headBody !== undefined) {
    const before = flattenSchema(baseBody);
    const after = flattenSchema(headBody);

    for (const [pointer, meta] of after) {
      const was = before.get(pointer);
      if (was === undefined && meta.required) {
        // Existing clients do not send it, so their requests start failing.
        breaking.push(`${key}: new REQUIRED request field: ${pointer}`);
      } else if (was !== undefined && !was.required && meta.required) {
        breaking.push(`${key}: request field became required: ${pointer}`);
      } else if (was === undefined) {
        additive.push(`${key}: optional request field added: ${pointer}`);
      }
    }
    for (const pointer of before.keys()) {
      if (!after.has(pointer)) breaking.push(`${key}: request field removed: ${pointer}`);
    }
  }

  // --- parameters -------------------------------------------------------
  const baseParams = new Map((baseOp.parameters ?? []).map((p) => [`${p.in}:${p.name}`, p]));
  const headParams = new Map((headOp.parameters ?? []).map((p) => [`${p.in}:${p.name}`, p]));

  for (const [name, param] of headParams) {
    const was = baseParams.get(name);
    if (was === undefined && param.required)
      breaking.push(`${key}: new required parameter ${name}`);
    else if (was !== undefined && !was.required && param.required)
      breaking.push(`${key}: parameter became required: ${name}`);
  }
  for (const [name] of baseParams) {
    if (!headParams.has(name)) breaking.push(`${key}: parameter removed: ${name}`);
  }
}

// --- report --------------------------------------------------------------
for (const entry of additive) console.log(`  additive  ${entry}`);
for (const entry of breaking) console.log(`  BREAKING  ${entry}`);

if (breaking.length === 0) {
  console.log(
    additive.length === 0
      ? `✔ No contract changes against ${baseRef}.`
      : `✔ ${additive.length} additive contract change(s) against ${baseRef}. Not breaking.`,
  );
  process.exit(0);
}

// A breaking change is allowed, but it must be DECLARED. The interlock below is
// what makes "is this breaking?" a mechanical question rather than a judgement.
const declaredInCommits = (() => {
  try {
    const log = git(["log", `${baseRef}..HEAD`, "--pretty=%B"]);
    return /BREAKING[ -]CHANGE|^[a-z]+(\([^)]*\))?!:/mu.test(log);
  } catch {
    return false;
  }
})();

const declaredByLabel = (process.env["PR_LABELS"] ?? "").includes("breaking-change");

if (declaredInCommits || declaredByLabel) {
  console.log(`\n✔ ${breaking.length} breaking change(s), declared. Ensure an ADR documents why.`);
  process.exit(0);
}

console.error(
  `\n✖ ${breaking.length} BREAKING contract change(s) against ${baseRef}, but none declared.\n\n` +
    `If this is intended, do all three:\n` +
    `  1. Mark the commit:  feat(api)!: ...   or add a "BREAKING CHANGE:" footer\n` +
    `  2. Label the PR:     breaking-change\n` +
    `  3. Add an ADR:       pnpm adr:new "Why the API contract changed"\n\n` +
    `If it is NOT intended, restore the removed/renamed fields — every consumer\n` +
    `of artifacts/openapi.json depends on them.\n`,
);
process.exit(1);

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateOpenApiDocument, serialiseOpenApiDocument } from "../src/http/openapi.ts";

/**
 * Writes artifacts/openapi.json — the committed, language-neutral contract.
 *
 * CI regenerates this and fails if the result differs from what is committed,
 * so the published spec can never drift from the schemas that produced it.
 */

const here = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(here, "../../../artifacts/openapi.json");

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, serialiseOpenApiDocument(generateOpenApiDocument()), "utf8");

console.log(`Wrote ${outputPath}`);

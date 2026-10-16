// Fails the build if the GitHub App's client secret could have reached the browser
// (ADR-0016, T11): no source file or built asset may even name it. The secret belongs to the
// exchange handler only. Runs after `vite build`, so it checks the bundle that ships.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(import.meta.dirname, "..");
// Assembled so this file does not match itself if it is ever scanned.
const pattern = new RegExp(["client", "secret"].join("[_\\s-]?"), "i");

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else yield path;
  }
}

const hits = ["src", "dist"]
  .flatMap((dir) => Array.from(files(join(root, dir))))
  .filter((path) => !/\.(woff2?|png|ico)$/.test(path))
  .filter((path) => pattern.test(readFileSync(path, "utf8")))
  .map((path) => relative(root, path));

if (hits.length > 0) {
  console.error(`A client secret is named in shipped code:\n  ${hits.join("\n  ")}`);
  process.exit(1);
}
console.log("check-no-client-secret: src/ and dist/ are clean.");

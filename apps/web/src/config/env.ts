import { z } from "zod";

// The CSP forbids string evaluation, and Zod 4 probes `new Function` to decide whether to
// compile its parsers. The probe fails safely but logs a Trusted Types violation on every load,
// so turn the compiler off before the first schema runs.
z.config({ jitless: true });

/**
 * The ONLY place the frontend reads import.meta.env.
 *
 * Validated at module load, so a misconfigured build fails immediately and
 * visibly rather than producing `undefined` values at runtime.
 *
 * Never put a secret behind a VITE_ prefix — everything here ships to the browser.
 */

// Empty for now: features add their variables here as they need them. Unknown keys (Vite's own
// MODE, DEV, ...) are stripped, so this accepts any build environment.
const EnvSchema = z.object({});

const parsed = EnvSchema.safeParse(import.meta.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
  throw new Error(`Invalid frontend environment configuration:\n${details}\n\nSee .env.example.`);
}

/** @public Unused until the first variable lands; kept so validation has one home. */
export const env = Object.freeze(parsed.data);

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

/** Unset and empty mean the same thing: Docker build args default to "". */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

/** https, or plain http on loopback for local development (FR-2.11). */
function isAllowedExchangeUrl(text: string): boolean {
  const url = URL.parse(text);
  if (url === null) return false;
  if (url.username !== "" || url.password !== "" || url.hash !== "") return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
}

// Unknown keys (Vite's own MODE, DEV, ...) are stripped, so this accepts any build environment.
const EnvSchema = z.object({
  // GitHub App client ids are `Iv1.` plus 16 hex digits, or `Iv23` plus letters and digits.
  VITE_GITHUB_APP_CLIENT_ID: optional(z.string().regex(/^Iv[\w.]{8,60}$/, "not a client id")),
  VITE_GITHUB_APP_EXCHANGE_URL: optional(
    z.url().refine(isAllowedExchangeUrl, "must be https:, or http://localhost / 127.0.0.1"),
  ),
});

export interface GitHubAppConfig {
  readonly clientId: string;
  readonly exchangeUrl: string;
}

interface Env {
  /** null unless BOTH GitHub App variables are set (FR-2.5); the button is disabled then. */
  readonly githubApp: GitHubAppConfig | null;
}

/** Exported for tests; the app uses `env`. Throws naming every invalid variable. */
export function parseEnv(raw: Record<string, unknown>): Env {
  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    // Paths and messages only: the rejected value is never echoed.
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid frontend environment configuration:\n${details}\n\nSee .env.example.`);
  }
  const clientId = parsed.data.VITE_GITHUB_APP_CLIENT_ID;
  const exchangeUrl = parsed.data.VITE_GITHUB_APP_EXCHANGE_URL;
  return Object.freeze({
    githubApp:
      clientId === undefined || exchangeUrl === undefined
        ? null
        : Object.freeze({ clientId, exchangeUrl }),
  });
}

export const env = parseEnv(import.meta.env);

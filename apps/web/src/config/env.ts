import { z } from "zod";

/**
 * The ONLY place the frontend reads import.meta.env.
 *
 * Validated at module load, so a misconfigured build fails immediately and
 * visibly rather than producing `undefined` API URLs at runtime.
 *
 * Never put a secret behind a VITE_ prefix — everything here ships to the browser.
 */

const EnvSchema = z.object({
  /**
   * Absolute API origin, or an empty string meaning "same origin".
   *
   * Local development uses an absolute URL because Vite (5173) and the API
   * (3000) are different origins. Production builds leave this empty so the SPA
   * calls its own origin and nginx proxies /api to the backend — which is why
   * production needs no CORS at all.
   */
  VITE_API_URL: z.union([z.literal(""), z.url()]).default(""),
});

const parsed = EnvSchema.safeParse(import.meta.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
  throw new Error(`Invalid frontend environment configuration:\n${details}\n\nSee .env.example.`);
}

export const env = Object.freeze(parsed.data);

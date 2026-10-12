import { z } from "zod";

/**
 * The ONLY place in the backend that reads process.env.
 *
 * Enforced by oxlint (`no-restricted-globals`) and dependency-cruiser. Everything
 * else receives an already-validated, frozen config object. Parsing happens once
 * at process start and fails fast with a message naming the offending variable —
 * a misconfigured deploy dies immediately instead of at the first request that
 * happens to touch the bad value.
 */

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:5173")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),
});

export type Env = Readonly<z.infer<typeof EnvSchema>>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `Invalid environment configuration:\n${details}\n\n` +
        "See .env.example for the full list of variables and their expected shape.",
    );
  }

  return Object.freeze(parsed.data);
}

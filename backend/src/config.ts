import { z } from "zod";

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  // Postgres connection string (Supabase: Project Settings > Database > Connection string).
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  // Supabase project URL, e.g. https://abcdefgh.supabase.co
  SUPABASE_URL: z.url({ protocol: /^https?$/ }).transform((url) => url.replace(/\/+$/, "")),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
});

export type Config = z.infer<typeof configSchema>;

/** Reads and validates configuration from the environment; fails fast on bad values. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

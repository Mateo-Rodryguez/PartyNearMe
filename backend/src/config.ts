import { z } from "zod";

/**
 * Explains what is wrong with a database URL without repeating it, since it
 * holds the password and errors end up in hosting logs.
 */
export function databaseUrlProblem(value: string): string | null {
  if (/^DATABASE_URL\s*=/.test(value)) return "remove the leading 'DATABASE_URL=': the value is only the link";
  if (/^["']|["']$/.test(value)) return "remove the quotes around the link";
  if (!/^postgres(ql)?:\/\//.test(value)) return "must be the whole link, starting with postgresql://";
  try {
    const url = new URL(value);
    if (!url.hostname || url.hash || url.search.includes("@") || url.pathname.includes("@")) throw new Error();
  } catch {
    return "not a valid link: if the password contains # / ? write them as %23 %2F %3F";
  }
  return null;
}

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  // Postgres connection string (Supabase: Project Settings > Database > Connection string).
  DATABASE_URL: z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      const problem = databaseUrlProblem(value);
      if (problem) ctx.addIssue({ code: "custom", message: problem });
    }),
  // Supabase project URL, e.g. https://abcdefgh.supabase.co
  SUPABASE_URL: z.url({ protocol: /^https?$/ }).transform((url) => url.replace(/\/+$/, "")),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
  // Cloudflare R2 photo storage. Uploads are disabled until all four are set.
  R2_ACCOUNT_ID: z.string().regex(/^[0-9a-f]{32}$/).optional(),
  R2_BUCKET: z.string().min(3).default("partynearme-media"),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  // Photo and caption moderation, used by the worker.
  OPENAI_API_KEY: z.string().min(1).optional(),
  // Push notifications: the Firebase service account JSON (Project settings >
  // Service accounts > Generate new private key). Push is off until it's set.
  FIREBASE_SERVICE_ACCOUNT: z.string().trim().min(1).optional(),
  // Also run the photo worker inside the API process. Saves a second paid
  // service while traffic is low; turn off once the worker runs on its own.
  RUN_WORKER: z.stringbool().default(false),
  // Shown on the privacy policy and terms pages (/privacy, /terms) as the way to reach us.
  CONTACT_EMAIL: z.email().optional(),
  // Sentry project DSN (public, not a secret). Unexpected errors are reported there once set.
  SENTRY_DSN: z.url({ protocol: /^https$/ }).optional(),
  // Public base URL photos are served from (R2 public bucket or custom domain).
  MEDIA_BASE_URL: z.url({ protocol: /^https$/ }).transform((url) => url.replace(/\/+$/, "")).optional(),
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

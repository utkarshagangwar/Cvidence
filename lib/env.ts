import "server-only";
import { z } from "zod";

// Server environment, read lazily so `next build` works without secrets.
// Missing or malformed values fail closed with the variable NAME only.

const positiveInt = z.coerce.number().int().positive();
/** Treat "" (a blank line in .env) as not set. */
const optionalText = (min: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().min(min).optional());

const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  SUPABASE_SECRET_KEY: z.string().min(20),
  NEXT_PUBLIC_SITE_URL: z.url().optional(),

  AI_PROVIDER_ORDER: z
    .string()
    .default("gemini,openrouter")
    .transform((s) => s.split(",").map((p) => p.trim()).filter(Boolean))
    .pipe(z.array(z.enum(["gemini", "openrouter"])).min(1)),
  GEMINI_API_KEY: optionalText(10),
  GEMINI_MODEL_CHEAP: optionalText(3),
  GEMINI_MODEL_STRONG: optionalText(3),
  OPENROUTER_API_KEY: optionalText(10),
  OPENROUTER_MODEL_CHEAP: optionalText(3),
  OPENROUTER_MODEL_STRONG: optionalText(3),

  /** Shared secret pg_cron sends to /api/worker/ingest. At least 32 characters. */
  WORKER_SECRET: optionalText(32),

  AI_DAILY_CREDITS: positiveInt.default(25),
  AI_DAILY_TOKEN_CAP: positiveInt.default(2_000_000),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((i) => String(i.path[0])))].join(", ");
    throw new Error(`Server configuration is missing or invalid: ${names}`);
  }
  cached = parsed.data;
  return cached;
}

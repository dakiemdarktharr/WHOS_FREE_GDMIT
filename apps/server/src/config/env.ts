import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

/**
 * Load the repository's env files first (the root `.env.local` holds local
 * credentials) and then this package's own files, so a per-package override
 * wins. Missing files are skipped silently.
 */
function loadEnvFiles(): void {
  // When launched from the repo root these pick up the root files directly;
  // when launched from apps/server the two-level-up entries still find the
  // root `.env.local`. A per-package override wins over the root file.
  const candidates = [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "..", ".env.local"),
    path.resolve(process.cwd(), "..", ".env"),
    path.resolve(process.cwd(), "..", "..", ".env.local"),
    path.resolve(process.cwd(), "..", "..", ".env"),
  ];
  const existing = [...new Set(candidates)].filter((file) => fs.existsSync(file));
  dotenv.config({ path: existing, quiet: true });
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required."),
  MONGODB_DB: z.string().min(1).default("whos_free"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGIN: z.string().default("*"),
});

export type Env = z.infer<typeof envSchema>;

function readEnv(): Env {
  loadEnvFiles();
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment configuration:");
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join(".") || "env"}: ${issue.message}`);
    }
    process.exit(1);
  }
  return parsed.data;
}

export const env: Env = readEnv();

/** CORS origins: `*` for open development, or a comma-separated allow-list. */
export function corsOrigins(): string | string[] {
  if (env.CORS_ORIGIN === "*") return "*";
  return env.CORS_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

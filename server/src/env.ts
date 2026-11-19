import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Load the repo-root .env in development. Real environment variables (hosting, CI) always win.
const rootEnv = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  DEVICE_SALT: z.string().min(16, 'DEVICE_SALT must be at least 16 characters'),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  /** Optional (stretch): enables the AI helpers. Empty = AI buttons hidden, everything else works. */
  GEMINI_API_KEY: z.string().trim().optional(),
  /** Default: Google's alias for its newest Flash model (quality first; versions get retired). Empty = default. */
  /** End-to-end tests only: a fake AI instead of Gemini. Refused in production. */
  AI_FAKE: z
    .string()
    .optional()
    .transform((v) => v === '1' || v === 'true'),
  GEMINI_MODEL: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || 'gemini-flash-latest'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
    console.error(
      `\n[getit] Invalid or missing environment variables:\n${lines.join('\n')}\n` +
        'Copy .env.example to .env and fill it in.\n',
    );
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
export const isProd = env.NODE_ENV === 'production';

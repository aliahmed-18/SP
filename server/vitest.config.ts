import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests always run against TEST_DATABASE_URL (a throw-away DB), never the dev database.
const rootEnv = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
const testDb = process.env.TEST_DATABASE_URL;
if (!testDb) throw new Error('TEST_DATABASE_URL is not set (see .env.example).');
process.env.DATABASE_URL = testDb;

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    env: { NODE_ENV: 'test', DATABASE_URL: testDb },
    fileParallelism: false, // integration tests share one database
    testTimeout: 15_000,
    hookTimeout: 60_000,
  },
});

import { defineConfig, devices } from '@playwright/test';

// `npm run e2e` starts the app (server :4000 + client :5173) unless it is already running.
// E2E_BASE_URL=http://localhost:4000 tests an already-running production build (`npm run build && npm start`).
const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: external ?? 'http://localhost:5173',
    trace: 'off',
  },
  projects: [
    { name: 'laptop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: external
    ? undefined
    : {
        command: 'npm run dev',
        // The server-side AI flows run against a fake AI (never in production; see server/src/lib/ai-fake.ts).
        env: { AI_FAKE: '1', AI_FAKE_DELAY_MS: '2500' },
        url: 'http://localhost:5173',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});

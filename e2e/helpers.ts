import { devices, expect, test, type Browser, type Page } from '@playwright/test';

export async function phone(browser: Browser, opts: { dark?: boolean } = {}) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  if (opts.dark) await ctx.addInitScript(() => localStorage.setItem('getit.theme', 'dark'));
  return ctx.newPage();
}

export async function registerInstructor(page: Page) {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.goto('/register');
  await page.getByLabel('Name').fill('Dr. E2E');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return email;
}

/**
 * One fixed instructor per Playwright worker: registered once, logged in afterwards. Registration is
 * rate-limited per IP (50/h), and repeated test runs must never hit it; successful logins don't count.
 */
export async function loginTestInstructor(page: Page) {
  const email = `e2e-worker-${test.info().workerIndex}@example.com`;
  const creds = { name: 'Dr. E2E', email, password: 'password123' };
  // Log in first: only the very first run registers (registration is rate-limited per IP).
  let res = await page.request.post('/api/auth/login', { data: { email, password: creds.password } });
  if (res.status() === 401) res = await page.request.post('/api/auth/register', { data: creds });
  expect(res.ok(), `login failed: ${res.status()}`).toBe(true);
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Your lectures' })).toBeVisible();
}

/** Logs in, starts a session from the dashboard, returns the join code (host page open). */
export async function startSession(page: Page, topic = 'Linear regression and correlation') {
  await loginTestInstructor(page);
  await page.getByRole('button', { name: 'Start session' }).first().click();
  await page.getByLabel('Lecture topic').fill(topic);
  await page.getByRole('dialog').getByRole('button', { name: 'Start session' }).click();
  await expect(page).toHaveURL(/\/s\/[A-Z2-9]{5}\/host$/);
  return (await page.getByTestId('join-code').textContent())!.trim();
}

export async function joinAs(browser: Browser, code: string) {
  const p = await phone(browser);
  await p.goto(`/join/${code}`);
  await expect(p.getByRole('heading', { name: "You're in" })).toBeVisible();
  return p;
}

export async function ask(p: Page, text: string) {
  await p.getByRole('textbox', { name: 'Your question' }).fill(text);
  await p.getByRole('button', { name: 'Send' }).click();
  await expect(p.getByText('Question sent').last()).toBeVisible();
}

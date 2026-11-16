import { devices, expect, test, type Browser, type Page } from '@playwright/test';

// Phase 2 "done when": an instructor starts a session on a laptop, 2 phones join, the joined count
// updates live on the host (and the projector). One instructor + 2 phones = 3 browser contexts.
test.skip(({ isMobile }) => isMobile, 'multi-device flow runs once (laptop project)');

async function phone(browser: Browser) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  return ctx.newPage();
}

async function registerInstructor(page: Page) {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.goto('/register');
  await page.getByLabel('Name').fill('Dr. E2E');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return email;
}

test('register → course → start session → 2 phones join → live joined count', async ({
  page,
  browser,
  context,
}) => {
  await registerInstructor(page);

  // Course
  await page.getByRole('button', { name: 'New course' }).first().click();
  await page.getByLabel('Course name').fill('ITCS 444 — Mobile Development');
  await page.getByRole('button', { name: 'Create course' }).click();
  await expect(page.getByRole('heading', { name: 'ITCS 444 — Mobile Development' })).toBeVisible();

  // Start session
  await page.getByRole('button', { name: 'Start session' }).first().click();
  await page.getByLabel('Lecture topic').fill('Linear regression and correlation');
  await expect(page.getByRole('switch', { name: 'Academic mode' })).toBeChecked();
  await page.getByRole('dialog').getByRole('button', { name: 'Start session' }).click();
  await expect(page).toHaveURL(/\/s\/[A-Z2-9]{5}\/host$/);
  const code = (await page.getByTestId('join-code').textContent())!.trim();
  await expect(page.getByTestId('joined-count')).toHaveText('0');

  // Projector window (same login).
  const projector = await context.newPage();
  await projector.goto(`/s/${code}/present`);
  await expect(projector.getByRole('heading', { name: 'Linear regression and correlation' })).toBeVisible();
  await expect(projector.getByRole('img', { name: /QR code to join/ })).toBeVisible();
  await expect(projector.getByTestId('present-joined')).toHaveText('0');

  // Phone 1 scans the QR (opens /join/CODE).
  const p1 = await phone(browser);
  await p1.goto(`/join/${code}`);
  await expect(p1).toHaveURL(new RegExp(`/s/${code}$`));
  await expect(p1.getByRole('heading', { name: "You're in" })).toBeVisible();
  await expect(p1.getByText('Linear regression and correlation')).toBeVisible();
  await expect(page.getByTestId('joined-count')).toHaveText('1');

  // Phone 2 types the code on the home page (lower case + spaces).
  const p2 = await phone(browser);
  await p2.goto('/');
  await p2.getByLabel('Session code').fill(code.toLowerCase().split('').join(' '));
  await p2.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(p2.getByRole('heading', { name: "You're in" })).toBeVisible();
  await expect(page.getByTestId('joined-count')).toHaveText('2');
  await expect(projector.getByTestId('present-joined')).toHaveText('2');

  // A refreshed phone is the same device: still 2.
  await p1.reload();
  await expect(p1.getByRole('heading', { name: "You're in" })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByTestId('joined-count')).toHaveText('2');

  // The host page also survives a refresh with the same state.
  await page.reload();
  await expect(page.getByTestId('joined-count')).toHaveText('2');

  // End session → phones and projector update live.
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'End session' }).click();
  await page.getByRole('button', { name: 'End session' }).click();
  await expect(page.getByText('Ended', { exact: true })).toBeVisible();
  await expect(p1.getByRole('heading', { name: 'The lecture has ended' })).toBeVisible();
  await expect(p2.getByRole('heading', { name: 'The lecture has ended' })).toBeVisible();
  await expect(projector.getByRole('heading', { name: 'The lecture has ended' })).toBeVisible();

  // Dashboard lists it as ended with 2 joined.
  await page.goto('/dashboard');
  await expect(page.getByRole('link', { name: /Linear regression and correlation/ })).toContainText('Ended');
});

test('seeded demo account logs in and sees last week’s lecture', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('demo@getit.app');
  await page.getByLabel('Password').fill('getit-demo-2026');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'ITCS 444 — Mobile Development' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Linear regression and correlation/ }).last()).toBeVisible();
});

test('wrong password shows one generic error', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('demo@getit.app');
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');
});

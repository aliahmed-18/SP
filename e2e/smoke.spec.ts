import { expect, test } from '@playwright/test';

test('home shows the real logo and both cards', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('img', { name: 'Getit' }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Join a lecture' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Start a session' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('join code input normalises; an unknown code shows the error and lets you retype', async ({ page }) => {
  await page.goto('/');
  const input = page.getByLabel('Session code');
  const join = page.getByRole('button', { name: 'Join', exact: true });
  await input.fill('bce');
  await expect(join).toBeDisabled();
  await input.fill('zz zz9');
  await expect(input).toHaveValue('ZZZZ9');
  await join.click();
  await expect(page).toHaveURL(/\/join\/ZZZZ9$/);
  await expect(page.getByRole('alert')).toHaveText("That session doesn't exist or has expired.");
  await expect(page.getByLabel('Session code')).toHaveValue('ZZZZ9');
});

test('/api/health is ok', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual({ ok: true, db: true });
});

test('instructor pages redirect to login when logged out', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
});

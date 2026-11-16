import { expect, test } from '@playwright/test';

// Phase 1 smoke test. The full demo flow (docs/07-demo-script.md) replaces this in Phase 7.
test('home shows the real logo, both cards, and a live socket + DB', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('img', { name: 'Getit' }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Join a lecture' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Start a session' })).toBeVisible();
  await expect(page.getByTestId('system-status')).toHaveAttribute('data-state', 'ok', { timeout: 15_000 });
  await expect(page.getByTestId('system-status')).toContainText('Socket connected');
});

test('join code input normalises and validates', async ({ page }) => {
  await page.goto('/');
  const input = page.getByLabel('Session code');
  const join = page.getByRole('button', { name: 'Join', exact: true });
  await input.fill('bce');
  await expect(join).toBeDisabled();
  await input.fill('bc eu3');
  await expect(input).toHaveValue('BCEU3');
  await join.click();
  await expect(page).toHaveURL(/\/join\/BCEU3$/);
});

test('/api/health is ok', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual({ ok: true, db: true });
});

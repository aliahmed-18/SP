import { devices, expect, test } from '@playwright/test';
import { loginTestInstructor } from './helpers';

// Calendar: plan a lecture from the dashboard calendar, prepare it, phones wait, Start now lets them in.
test.skip(({ isMobile }) => isMobile, 'instructor flow runs once (laptop project)');
test.setTimeout(90_000);

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

test('plan from the calendar → prepare → phone waits → Start now → phone joins', async ({
  page,
  browser,
}) => {
  await loginTestInstructor(page);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (tomorrow.getMonth() !== new Date().getMonth())
    await page.getByTestId('calendar').getByRole('button', { name: 'Next month' }).click();

  // Pick tomorrow in the calendar → "Plan a lecture" opens on "Plan for later" for that day.
  await page.getByTestId(`day-${dayKey(tomorrow)}`).click();
  await page.getByTestId('calendar-day').getByRole('button', { name: 'Plan a lecture' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByTestId('mode-plan')).toHaveAttribute('aria-checked', 'true');
  await expect(dialog.getByLabel('Date', { exact: true })).toHaveValue(dayKey(tomorrow));
  const topic = `Planned ${Date.now()}`;
  await dialog.getByLabel('Lecture topic').fill(topic);
  await dialog.getByLabel('Time', { exact: true }).fill('10:00');
  await dialog.getByRole('button', { name: 'Plan lecture' }).click();

  // Its page: planned banner; activities can be prepared, but not launched yet.
  await expect(page).toHaveURL(/\/s\/[A-Z2-9]{5}\/host$/);
  const code = page.url().split('/s/')[1]!.split('/')[0]!;
  await expect(page.getByTestId('scheduled-banner')).toContainText('Planned for');
  await expect(page.getByRole('button', { name: 'Start presenting' })).toHaveCount(0);
  const prepared = await page.request.post(`/api/sessions/${code}/activities`, {
    data: {
      type: 'QUICK_CHECK',
      kind: 'TRUE_FALSE',
      prompt: 'r can be 2.',
      correct: false,
      explanation: 'No.',
    },
  });
  expect(prepared.status()).toBe(201);
  await expect(page.getByTestId('activity-row')).toHaveCount(1);
  await expect(page.getByTestId('activity-row').getByRole('button', { name: 'Launch' })).toHaveCount(0);

  // "Add to calendar" is a real .ics file.
  const [ics] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Add to calendar' }).click(),
  ]);
  expect(ics.suggestedFilename()).toBe(`getit-${code.toLowerCase()}.ics`);

  // A student opens the code early → waiting room.
  const phone = await (await browser.newContext({ ...devices['Pixel 7'] })).newPage();
  await phone.goto(`/join/${code}`);
  await expect(phone.getByTestId('waiting-room')).toContainText(topic);

  // The dashboard lists it under Upcoming.
  await page.goto('/dashboard');
  await expect(page.getByTestId('upcoming')).toContainText(topic);
  await page.goto(`/s/${code}/host`);

  // Start now → LIVE; the waiting phone joins by itself; activities can be launched.
  await page.getByTestId('scheduled-banner').getByRole('button', { name: 'Start now' }).click();
  await expect(page.getByTestId('scheduled-banner')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start presenting' })).toBeVisible();
  await expect(phone.getByRole('heading', { name: "You're in" })).toBeVisible({ timeout: 25_000 });
  await page.getByTestId('activity-row').getByRole('button', { name: 'Launch' }).click();
  await expect(phone.getByText('r can be 2.')).toBeVisible();
});

test('edit and cancel a planned lecture', async ({ page }) => {
  await loginTestInstructor(page);
  await page.getByRole('button', { name: 'Plan a lecture' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Lecture topic').fill('To be cancelled');
  await dialog.getByRole('button', { name: 'Plan lecture' }).click();
  await expect(page.getByTestId('scheduled-banner')).toBeVisible();

  await page.getByTestId('scheduled-banner').getByRole('button', { name: 'Edit' }).click();
  const edit = page.getByRole('dialog');
  await edit.getByLabel('Lecture topic').fill('Moved lecture');
  await edit.getByRole('switch').click(); // auto-start off
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: /Moved lecture/ })).toBeVisible();
  await expect(page.getByTestId('scheduled-banner')).toContainText('Waits for you to press Start now');

  await page.getByTestId('scheduled-banner').getByRole('button', { name: 'Cancel lecture' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel lecture' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('dashboard: Next up card, Upcoming / Past tabs and search', async ({ page }) => {
  await loginTestInstructor(page);
  const topic = `Searchable ${Date.now()}`;
  await page.getByRole('button', { name: 'Plan a lecture' }).first().click();
  await page.getByRole('dialog').getByLabel('Lecture topic').fill(topic);
  await page.getByRole('dialog').getByRole('button', { name: 'Plan lecture' }).click();
  await expect(page.getByTestId('scheduled-banner')).toBeVisible();

  await page.goto('/dashboard');
  await expect(page.getByTestId('next-up')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search lectures' }).fill(topic);
  await expect(page.getByTestId('upcoming').getByRole('link')).toHaveCount(1);
  await expect(page.getByTestId('upcoming')).toContainText(topic);
  await page.getByRole('tab', { name: /^Past/ }).click();
  await expect(page.getByText(/No lectures match/)).toBeVisible();

  // Clean up so later runs keep a short Upcoming list.
  const code = (await page.request.get('/api/sessions').then((r) => r.json())).find(
    (s: { topic: string }) => s.topic === topic,
  ).code as string;
  expect((await page.request.delete(`/api/sessions/${code}`)).status()).toBe(204);
});

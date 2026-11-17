import { expect, test } from '@playwright/test';
import { startSession } from './helpers';

// The projector's "hide the screen" must never trap the instructor: the button, a click anywhere,
// B or the clicker's "next" key all bring the screen back (and "next" does not run a step unseen).
test.skip(({ isMobile }) => isMobile, 'projector runs on a laptop');

test('hidden projector screen comes back by button, click, B or the next key', async ({ page, context }) => {
  const code = await startSession(page);
  const res = await page.request.post(`/api/sessions/${code}/activities`, {
    data: { type: 'EXPLAIN', prompt: 'What does the slope tell you?', modelAnswer: 'Change in y per x.' },
  });
  expect(res.status()).toBe(201);
  const proj = await context.newPage();
  await proj.setViewportSize({ width: 1366, height: 768 });
  await proj.goto(`/s/${code}/present`);
  await expect(proj.getByText('Welcome! Scan to join the session')).toBeVisible();
  const welcome = proj.getByText('Welcome! Scan to join the session');

  // 1. Header button → hidden → "Show screen" button.
  await proj.getByTestId('present-hide').click();
  await expect(welcome).toBeHidden();
  await proj.mouse.move(200, 200);
  await proj.mouse.move(300, 300);
  await proj.getByRole('button', { name: /Show screen/ }).click();
  await expect(welcome).toBeVisible();

  // 2. B → hidden → click anywhere.
  await proj.locator('body').press('b');
  await expect(proj.getByTestId('present-blank')).toBeVisible();
  await proj.mouse.click(600, 400);
  await expect(welcome).toBeVisible();

  // 3. B → hidden → → (clicker): shows the screen again, still on the welcome step.
  await proj.locator('body').press('b');
  await expect(welcome).toBeHidden();
  await proj.locator('body').press('ArrowRight');
  await expect(welcome).toBeVisible();
  await expect(proj.getByTestId('present-next')).toContainText('Start first activity');

  // Controls stay on screen on a 768-px-tall laptop.
  await expect(proj.getByTestId('present-next')).toBeInViewport();
});

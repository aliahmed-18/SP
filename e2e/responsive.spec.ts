import { expect, test } from '@playwright/test';
import { ask, joinAs, startSession } from './helpers';

// Phone/tablet layouts: the home page puts the headline under the logo and instructors before students;
// the host page shows Session and Q&A as two tabs instead of side by side.
test.skip(({ isMobile }) => !isMobile, 'phone layout (phone project)');

test('home: headline, then For instructors, then For students', async ({ page }) => {
  await page.goto('/');
  const top = async (name: string) => (await page.getByRole('heading', { name }).boundingBox())!.y;
  const hero = (await page.locator('#hero-title').boundingBox())!.y;
  const instructors = await top('Start a session');
  const students = await top('Join a lecture');
  expect(hero).toBeLessThan(instructors);
  expect(instructors).toBeLessThan(students);
});

test('host on a phone: Session and Q&A tabs, with an open-question count', async ({ page, browser }) => {
  const code = await startSession(page);
  await expect(page.getByRole('button', { name: 'Start presenting' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Q&A' })).toBeHidden();

  const p1 = await joinAs(browser, code);
  await ask(p1, 'How do we get Sxy from the table?');
  const qaTab = page.getByTestId('host-view-qa');
  await expect(qaTab).toContainText('1');

  await qaTab.click();
  await expect(qaTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Q&A' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start presenting' })).toBeHidden();
  await page.getByRole('tab', { name: /List/ }).click();
  await expect(page.getByTestId('host-question')).toContainText('Sxy');

  await page.getByTestId('host-view-session').click();
  await expect(page.getByRole('button', { name: 'Start presenting' })).toBeVisible();
});

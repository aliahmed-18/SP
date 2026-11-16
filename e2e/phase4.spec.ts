import { expect, test, type Page } from '@playwright/test';
import { joinAs, startSession } from './helpers';

// Phase 4: Quick Check end to end (peer-instruction round 2, confidence, reveal, refresh + offline).
test.skip(({ isMobile }) => isMobile, 'multi-device flow runs once (laptop project)');

async function createMcq(page: Page) {
  await page.getByRole('button', { name: 'Multiple choice' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Question').fill('Which value of r shows the strongest linear relationship?');
  await dlg.getByLabel('Option A', { exact: true }).fill('r = 0.45');
  await dlg.getByLabel('Option B', { exact: true }).fill('r = −0.92');
  await dlg.getByRole('button', { name: 'Add option' }).click();
  await dlg.getByLabel('Option C', { exact: true }).fill('r = 0.80');
  await dlg.getByRole('button', { name: 'Mark option B as correct' }).click();
  await dlg.getByLabel('Explanation').fill('Strength is the size of r, ignoring the sign.');
  await dlg.getByRole('button', { name: 'Save activity' }).click();
  await expect(dlg).toBeHidden();
}

test('Quick Check: launch → answers + confidence → results → round 2 → reveal', async ({ page, browser }) => {
  const code = await startSession(page);
  await createMcq(page);
  const row = page.getByTestId('activity-row').first();
  await expect(row).toContainText('Which value of r');

  const [p1, p2, p3] = [
    await joinAs(browser, code),
    await joinAs(browser, code),
    await joinAs(browser, code),
  ];

  // Launch → every phone switches to the question; the answer is NOT in the page.
  await row.getByRole('button', { name: 'Launch' }).click();
  for (const p of [p1, p2, p3]) {
    await expect(p.getByRole('heading', { name: /strongest linear relationship/ })).toBeVisible();
    await expect(p.getByText('Pick one answer')).toBeVisible();
  }
  expect(await p1.content()).not.toContain('ignoring the sign');

  // p1 right + Sure, p2 wrong + Sure (→ "sure and wrong").
  await p1.getByRole('button', { name: /r = −0.92/ }).click();
  await expect(p1.getByTestId('answer-sent')).toContainText('Answer sent');
  await p1.getByRole('button', { name: 'Sure', exact: true }).click();
  await p2.getByRole('button', { name: /r = 0.45/ }).click();
  await p2.getByRole('button', { name: 'Sure', exact: true }).click();
  await expect(row.getByTestId('answered-count')).toHaveText('2');
  await expect(row).toContainText('/ 3 answered');

  // Can't answer twice; a refreshed phone is back on "Answer sent" with its choice.
  await expect(p1.getByRole('button', { name: /r = 0.45/ })).toHaveCount(0); // options are no longer buttons
  await p1.reload();
  await expect(p1.getByTestId('answer-sent')).toBeVisible();
  await expect(p1.getByRole('button', { name: 'Sure', exact: true })).toHaveAttribute('aria-pressed', 'true');

  // Offline for a few seconds while the question is live: comes back to the same screen.
  await p3.context().setOffline(true);
  await expect(p3.getByTestId('reconnecting-banner')).toBeVisible({ timeout: 15_000 });
  await p3.context().setOffline(false);
  await expect(p3.getByTestId('reconnecting-banner')).toBeHidden({ timeout: 20_000 });
  await expect(p3.getByText('Pick one answer')).toBeVisible();

  // Ask while a question is live: floating Ask button → sheet.
  await p3.getByRole('button', { name: 'Ask' }).click();
  await p3.getByRole('textbox', { name: 'Your question' }).fill('Why does the sign not matter?');
  await p3.getByRole('button', { name: 'Send' }).click();
  await expect(p3.getByText('Question sent')).toBeVisible();

  // Close (no reveal): results for the host, phones wait.
  await row.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(row.getByText('Responses')).toBeVisible();
  await expect(row).toContainText('50%');
  await expect(row.getByTestId('suggestion')).toHaveText('Discuss with your neighbour, then vote again');
  await expect(p3.getByText('Answering is closed for this question.')).toBeVisible();

  // Round 2: everyone votes again.
  await row.getByRole('button', { name: 'Start round 2' }).click();
  for (const p of [p1, p2, p3]) await expect(p.getByText('Vote again · round 2')).toBeVisible();
  for (const p of [p1, p2, p3]) {
    await p.getByRole('button', { name: /r = −0.92/ }).click();
    await expect(p.getByTestId('answer-sent')).toBeVisible();
  }
  await expect(row.getByTestId('answered-count')).toHaveText('3');

  // Close and show the answer: round comparison on the host, results on phones.
  await row.getByRole('button', { name: 'Close and show answer' }).click();
  await expect(row.getByText('Round comparison')).toBeVisible();
  await expect(row).toContainText('100%');
  for (const p of [p1, p2, p3]) {
    await expect(p.getByText('You got it')).toBeVisible();
    await expect(p.getByText('Strength is the size of r, ignoring the sign.')).toBeVisible();
  }

  // Back to the lecture → the ask box again.
  await p2.getByRole('button', { name: 'Back to the lecture' }).click();
  await expect(p2.getByRole('heading', { name: "You're in" })).toBeVisible();
});

test('numeric Quick Check: comma decimals, tolerance, "Not quite" for a wrong answer', async ({
  page,
  browser,
}) => {
  const code = await startSession(page);
  await page.getByRole('button', { name: 'Write a number' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Question').fill('Using ŷ = 327.04 − 14.2x, what is ŷ when x = 20?');
  await dlg.getByLabel('Correct answer', { exact: true }).fill('43.04');
  await dlg.getByLabel('Tolerance (±)').fill('0.1');
  await dlg.getByLabel('Explanation').fill('327.04 − 14.2 × 20 = 43.04');
  await dlg.getByRole('button', { name: 'Save activity' }).click();
  const [right, wrong] = [await joinAs(browser, code), await joinAs(browser, code)];
  await page.getByTestId('activity-row').getByRole('button', { name: 'Launch' }).click();

  await right.getByLabel('Your answer').fill('43,1');
  await right.getByRole('button', { name: 'Send answer' }).click();
  await wrong.getByLabel('Your answer').fill('abc');
  await wrong.getByRole('button', { name: 'Send answer' }).click();
  await expect(wrong.getByText('Enter a number, e.g. 43.04')).toBeVisible();
  await wrong.getByLabel('Your answer').fill('47.04');
  await wrong.getByRole('button', { name: 'Send answer' }).click();
  await expect(wrong.getByTestId('answer-sent')).toBeVisible();

  await page.getByRole('button', { name: 'Close and show answer' }).click();
  await expect(right.getByText('You got it')).toBeVisible();
  await expect(wrong.getByText('Not quite — here’s why')).toBeVisible();
  await expect(wrong.getByText('Correct answer: 43.04')).toBeVisible();
});

test('copy the seeded templates into a new session (demo account)', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('demo@getit.app');
  await page.getByLabel('Password').fill('getit-demo-2026');
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByRole('button', { name: 'Start session' }).first().click();
  await page.getByLabel('Lecture topic').fill('Template copy check');
  await page.getByRole('dialog').getByRole('button', { name: 'Start session' }).click();
  await page.getByRole('button', { name: 'Copy from an earlier session' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Linear regression and correlation/ })
    .first()
    .click();
  await expect(page.getByTestId('activity-row')).toHaveCount(4);
  // Tidy: end it so the demo dashboard stays clean.
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'End session' }).click();
  await page.getByRole('button', { name: 'End session' }).click();
});

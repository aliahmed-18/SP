import { expect, test, type Page } from '@playwright/test';
import type { AiGroupResult, HostState } from '@getit/shared';
import { ask, joinAs, startSession } from './helpers';

// AI helpers, client side. Grouping replies are faked at the network edge; generation runs on the
// real server with its test-only fake AI (AI_FAKE=1, see playwright.config.ts) — production uses Gemini.
test.skip(({ isMobile }) => isMobile, 'instructor flow runs once (laptop project)');

const SLIDES =
  'The least-squares regression line minimises the sum of squared residuals. The slope b = Sxy / Sxx is ' +
  'the change in y for each one-unit increase in x. The correlation r lies between −1 and 1 and measures ' +
  'the strength of a linear relationship. Correlation does not imply causation.';

async function aiOn(page: Page) {
  await page.route('**/api/ai/status', (r) => r.fulfill({ json: { enabled: true } }));
}

test('Group with AI: review, rename, apply → a real topic that phones see', async ({ page, browser }) => {
  await aiOn(page);
  const code = await startSession(page);
  const phones = [await joinAs(browser, code), await joinAs(browser, code), await joinAs(browser, code)];
  await ask(phones[0]!, 'How do we get Sxy from the table?');
  await ask(phones[1]!, 'How do we compute the slope b?');
  await ask(phones[2]!, 'What does r = 0 mean?');

  const host = (await (await page.request.get(`/api/sessions/${code}/host`)).json()) as HostState;
  const id = (t: string) => host.questions.find((q) => q.text.includes(t))!.id;
  let calls = 0;
  await page.route(`**/api/sessions/${code}/ai/group`, (r) => {
    calls++;
    return r.fulfill({
      json: {
        suggestions: [{ title: 'Slope', topicId: null, questionIds: [id('Sxy'), id('slope b')] }],
      } satisfies AiGroupResult,
    });
  });

  await page.getByRole('button', { name: 'Group with AI' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByTestId('ai-suggestions')).toContainText('How do we get Sxy from the table?');
  await expect(dialog).toContainText('without any student identity');
  await dialog.getByRole('textbox', { name: 'Topic title' }).fill('Computing the slope');
  await dialog.getByRole('button', { name: 'Apply topic' }).click();
  await expect(dialog).toBeHidden();
  expect(calls).toBe(1); // one AI request per opening

  await page.getByRole('tab', { name: /Topics/ }).click();
  await expect(page.getByTestId('host-topic')).toContainText('Computing the slope');
  await expect(phones[0]!.getByTestId('student-topic')).toContainText('Computing the slope');
});

const generation =
  'server-side generation needs the fake AI (AI_FAKE=1); not available on a production build';

test('AI generation: Generate closes the dialog; drafts land as AI drafts; review, confirm, confirm all', async ({
  page,
}) => {
  test.skip(!!process.env.E2E_BASE_URL, generation);
  await startSession(page);
  await page.getByRole('button', { name: 'AI generation' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByTestId('ai-generate')).toBeDisabled(); // nothing pasted yet
  await dialog.getByLabel('Or paste slide text or notes').fill(SLIDES);
  await dialog.getByRole('button', { name: '3', exact: true }).click();
  await dialog.getByTestId('ai-generate').click();

  // The dialog closes at once: the instructor keeps teaching while the server works.
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Preparing drafts in the background')).toBeVisible();
  await expect(page.getByTestId('ai-job')).toContainText('AI is preparing drafts… 0 of 3 ready');

  const rows = page.getByTestId('activity-row');
  await expect(rows).toHaveCount(3, { timeout: 15_000 });
  await expect(page.getByText('3 AI drafts are ready to review')).toBeVisible();
  await expect(page.getByTestId('ai-review-bar')).toContainText('AI drafts waiting for review: 3');
  await expect(page.getByTestId('ai-draft-badge')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Launch' })).toHaveCount(0); // AI drafts can't be launched

  // Review one → Confirm draft → it can be launched; then Confirm all (with a warning first).
  await rows.first().getByRole('button', { name: 'Review' }).click();
  await expect(rows.first().getByTestId('ai-draft-help')).toBeVisible();
  await rows.first().getByRole('button', { name: 'Confirm draft' }).click();
  await expect(page.getByTestId('ai-review-bar')).toContainText('AI drafts waiting for review: 2');
  await expect(rows.first().getByRole('button', { name: 'Launch' })).toBeVisible();
  await page.getByTestId('ai-review-bar').getByRole('button', { name: 'Confirm all' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('AI drafts can contain mistakes');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm all' }).click();
  await expect(page.getByTestId('ai-review-bar')).toBeHidden();
  await expect(page.getByTestId('ai-draft-badge')).toHaveCount(0);
});

test('AI generation survives leaving the page: reload mid-generation, drafts still arrive', async ({
  page,
}) => {
  test.skip(!!process.env.E2E_BASE_URL, generation);
  const code = await startSession(page);
  await page.getByRole('button', { name: 'AI generation' }).click();
  await page.getByRole('dialog').getByLabel('Or paste slide text or notes').fill(SLIDES);
  await page.getByRole('dialog').getByTestId('ai-generate').click();
  await expect(page.getByTestId('ai-job')).toBeVisible();

  // The instructor goes to the dashboard and comes back (or the laptop sleeps, or the tab reloads).
  await page.goto('/dashboard');
  await page.goto(`/s/${code}/host`);
  await expect(page.getByTestId('activity-row')).toHaveCount(5, { timeout: 15_000 });
  await expect(page.getByTestId('ai-review-bar')).toContainText('AI drafts waiting for review: 5');
});

test('AI failure to start is a readable message; files kept; the manual flow stays', async ({ page }) => {
  await aiOn(page);
  const code = await startSession(page);
  await page.route(`**/api/sessions/${code}/ai/generate`, (r) =>
    r.fulfill({
      status: 429,
      json: {
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many AI requests. Try again in a few minutes.',
        },
      },
    }),
  );
  await page.getByRole('button', { name: 'AI generation' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Or paste slide text or notes').fill(SLIDES);
  await dialog.getByTestId('ai-generate').click();
  await expect(dialog.getByTestId('ai-error')).toContainText('Too many AI requests');
  await expect(dialog.getByLabel('Or paste slide text or notes')).toHaveValue(SLIDES); // paste kept
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden(); // fully closed before the next click
  await page
    .getByRole('button', { name: /Multiple choice/ })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toBeVisible(); // hand-made activities still work
});

test('without an AI key the AI buttons are hidden', async ({ page }) => {
  await page.route('**/api/ai/status', (r) => r.fulfill({ json: { enabled: false } }));
  await startSession(page);
  await expect(page.getByRole('heading', { name: 'Set up activities' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'AI generation' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Group with AI' })).toHaveCount(0);
});

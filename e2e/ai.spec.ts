import { expect, test, type Page } from '@playwright/test';
import type { AiGenerateResult, AiGroupResult, HostState } from '@getit/shared';
import { ask, joinAs, startSession } from './helpers';

// AI helpers, client side. The AI's replies are faked at the network edge (the server side, incl. the
// checks on what the AI returns, is covered by server/test/ai.test.ts); everything else is real.
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

test('AI generation: paste slides → pick drafts → added as drafts, nothing launched', async ({ page }) => {
  await aiOn(page);
  const code = await startSession(page);
  await page.route(`**/api/sessions/${code}/ai/generate`, async (r) => {
    expect(r.request().postDataJSON()).toMatchObject({ text: SLIDES, count: 3 });
    await r.fulfill({
      json: {
        drafts: [
          {
            type: 'QUICK_CHECK',
            kind: 'MCQ',
            prompt: 'What does the slope b measure?',
            options: ['Strength of the relationship', 'Change in y per unit of x', 'Causation'],
            correct: 1,
            explanation: 'b = Sxy / Sxx is the change in y for each one-unit increase in x.',
          },
          {
            type: 'QUICK_CHECK',
            kind: 'TRUE_FALSE',
            prompt: 'Correlation implies causation.',
            correct: false,
            explanation: 'A strong r alone never shows cause.',
          },
        ],
      } satisfies AiGenerateResult,
    });
  });

  await page.getByRole('button', { name: 'AI generation' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByTestId('ai-generate')).toBeDisabled(); // nothing pasted yet
  await dialog.getByLabel('Or paste slide text or notes').fill(SLIDES);
  await dialog.getByRole('button', { name: '3', exact: true }).click();
  await dialog.getByTestId('ai-generate').click();
  await expect(dialog.getByTestId('ai-drafts')).toContainText('Change in y per unit of x');
  await dialog.getByRole('checkbox', { name: /Correlation implies causation/ }).uncheck();
  await dialog.getByRole('button', { name: 'Add 1 draft' }).click();
  await expect(dialog).toBeHidden();

  const rows = page.getByTestId('activity-row');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('What does the slope b measure?');
  await expect(rows.first().getByRole('button', { name: 'Launch' })).toBeVisible(); // still a draft
});

test('AI failure is a readable message and the manual flow stays', async ({ page }) => {
  await aiOn(page);
  const code = await startSession(page);
  await page.route(`**/api/sessions/${code}/ai/generate`, (r) =>
    r.fulfill({
      status: 504,
      json: {
        error: { code: 'AI_TIMEOUT', message: 'The AI took too long. Try again, or carry on by hand.' },
      },
    }),
  );
  await page.getByRole('button', { name: 'AI generation' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Or paste slide text or notes').fill(SLIDES);
  await dialog.getByTestId('ai-generate').click();
  await expect(dialog.getByTestId('ai-error')).toContainText('The AI took too long');
  await expect(dialog.getByLabel('Or paste slide text or notes')).toHaveValue(SLIDES); // paste kept
  await page.keyboard.press('Escape');
  await page
    .getByRole('button', { name: /Multiple choice/ })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toBeVisible(); // hand-made activities still work
});

test('without an AI key the AI buttons are hidden', async ({ page }) => {
  await startSession(page);
  await expect(page.getByRole('heading', { name: 'Set up activities' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'AI generation' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Group with AI' })).toHaveCount(0);
});

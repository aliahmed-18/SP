import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { AiGenerateResult, AiKeyPointsResult, AiSortResult, HostState } from '@getit/shared';
import { joinAs, startSession } from './helpers';

// AI helpers, part 2 (client side): files read in the browser, Explain drafts, Take-away key points,
// sorting Explain answers. The AI's replies are faked at the network edge; everything else is real.
test.skip(({ isMobile }) => isMobile, 'instructor flow runs once (laptop project)');

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

async function aiOn(page: Page) {
  await page.route('**/api/ai/status', (r) => r.fulfill({ json: { enabled: true } }));
}

test('upload slides: PDF, PowerPoint (with notes), Word and HTML are read in the browser', async ({
  page,
}) => {
  await aiOn(page);
  const code = await startSession(page);
  let sent: { text: string; kinds: string[]; note: string } | undefined;
  await page.route(`**/api/sessions/${code}/ai/generate`, async (r) => {
    sent = r.request().postDataJSON();
    await r.fulfill({
      json: {
        drafts: [
          {
            type: 'EXPLAIN',
            prompt: 'In one sentence: what does R squared tell you?',
            modelAnswer: 'The share of the variation in y the line explains.',
          },
          {
            type: 'QUICK_CHECK',
            kind: 'TRUE_FALSE',
            prompt: 'Correlation implies causation.',
            correct: false,
            explanation: 'It does not.',
          },
        ],
      } satisfies AiGenerateResult,
    });
  });

  await page.getByRole('button', { name: 'AI generation' }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByTestId('ai-file-input')
    .setInputFiles(['lecture.pdf', 'slides.pptx', 'notes.docx', 'notes.html', 'old.ppt'].map(fixture));
  const files = dialog.getByTestId('ai-files');
  await expect(files.getByText('Text ready')).toHaveCount(4, { timeout: 15_000 });
  await expect(files).toContainText('Old .doc/.ppt files are not supported');

  await dialog.getByLabel('Note for the AI (optional)').fill('Focus on the main formulas');
  await dialog.getByRole('button', { name: 'Explain', exact: true }).click();
  await dialog.getByTestId('ai-generate').click();
  await expect(dialog.getByTestId('ai-drafts')).toContainText('Model answer (only you see it)');

  expect(sent!.note).toBe('Focus on the main formulas');
  expect(sent!.kinds).toContain('EXPLAIN');
  for (const t of [
    'R squared equals r squared', // PDF
    'Slide 2', // PowerPoint
    'the slope has the units of y per unit of x', // speaker notes
    'Correlation does not imply causation.', // Word
    'Residuals sum to zero', // HTML
  ])
    expect(sent!.text).toContain(t);
  expect(sent!.text).not.toContain('var x=1'); // HTML scripts and styles are dropped
  expect(sent!.text).not.toContain('color:red');

  await dialog.getByRole('button', { name: 'Add 2 drafts' }).click();
  const rows = page.getByTestId('activity-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Explain');
});

test('Take-away: AI draft key points fill the editor, then publish as usual', async ({ page, browser }) => {
  await aiOn(page);
  const code = await startSession(page);
  await page.request.post(`/api/sessions/${code}/topics`, { data: { title: 'Computing the slope' } });
  const phone = await joinAs(browser, code);
  await page.route(`**/api/sessions/${code}/ai/keypoints`, (r) =>
    r.fulfill({
      json: {
        keyPoints: [
          'The slope b is the change in y for each one-unit increase in x.',
          'Correlation does not imply causation.',
        ],
      } satisfies AiKeyPointsResult,
    }),
  );
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'End session' }).click();
  await page.getByRole('button', { name: 'End session' }).click();

  const editor = page.getByTestId('takeaway-editor');
  await editor.getByRole('button', { name: 'AI draft key points' }).click();
  await expect(editor.getByLabel('Key point 1', { exact: true })).toHaveValue(
    'The slope b is the change in y for each one-unit increase in x.',
  );
  await expect(editor.getByLabel('Key point 2', { exact: true })).toHaveValue(
    'Correlation does not imply causation.',
  );
  await editor.getByRole('button', { name: 'Publish' }).click();
  await expect(phone.getByTestId('takeaway')).toContainText('Correlation does not imply causation.');
});

test('Explain: sort answers with AI → tags applied only after confirming', async ({ page, browser }) => {
  await aiOn(page);
  const code = await startSession(page);
  await page.request.post(`/api/sessions/${code}/activities`, {
    data: { type: 'EXPLAIN', prompt: "What does the slope b tell you that r doesn't?" },
  });
  const phones = [await joinAs(browser, code), await joinAs(browser, code), await joinAs(browser, code)];
  const row = page.getByTestId('activity-row').first();
  await row.getByRole('button', { name: 'Launch' }).click();
  const texts = ['The change in y per unit of x.', 'Rise over run.', 'How strong the relationship is.'];
  for (const [i, p] of phones.entries()) {
    await p.getByRole('textbox', { name: 'Your answer' }).fill(texts[i]!);
    await p.getByRole('button', { name: 'Send' }).click();
    await expect(p.getByText('Answer sent')).toBeVisible();
  }
  await row.getByRole('button', { name: 'Close answers' }).click();
  await expect(row.getByTestId('explain-answers').getByRole('listitem')).toHaveCount(3);

  const host = (await (await page.request.get(`/api/sessions/${code}/host`)).json()) as HostState;
  const id = (t: string) => host.activities[0]!.explainAnswers.find((x) => x.text === t)!.id;
  await page.route('**/api/activities/*/ai/sort', (r) =>
    r.fulfill({
      json: {
        groups: [
          { label: 'Change in y per unit of x', tag: 'CORRECT', answerIds: [id(texts[0]!), id(texts[1]!)] },
          { label: 'Confuses slope with strength', tag: 'MISCONCEPTION', answerIds: [id(texts[2]!)] },
        ],
      } satisfies AiSortResult,
    }),
  );
  await row.getByRole('button', { name: 'Sort answers with AI' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByTestId('ai-answer-groups')).toContainText('Confuses slope with strength');
  // Nothing is tagged until the instructor confirms.
  const before = (await (await page.request.get(`/api/sessions/${code}/host`)).json()) as HostState;
  expect(before.activities[0]!.explainAnswers.every((x) => x.tag === null)).toBe(true);
  await dialog.getByRole('button', { name: 'Tag 3 answers' }).click();
  await expect(dialog).toBeHidden();
  await expect(row.getByRole('button', { name: /Correct \(2\)/ })).toBeVisible();
  await expect(row.getByRole('button', { name: /Misconception \(1\)/ })).toBeVisible();
});

test('Group with AI can be undone', async ({ page, browser }) => {
  await aiOn(page);
  const code = await startSession(page);
  const phones = [await joinAs(browser, code), await joinAs(browser, code), await joinAs(browser, code)];
  const qs = ['How do we get Sxy?', 'How do we compute b?', 'What is r?'];
  for (const [i, p] of phones.entries()) {
    await p.getByRole('textbox', { name: 'Your question' }).fill(qs[i]!);
    await p.getByRole('button', { name: 'Send' }).click();
    await expect(p.getByText('Question sent').last()).toBeVisible();
  }
  const host = (await (await page.request.get(`/api/sessions/${code}/host`)).json()) as HostState;
  await page.route(`**/api/sessions/${code}/ai/group`, (r) =>
    r.fulfill({
      json: {
        suggestions: [
          { title: 'Slope', topicId: null, questionIds: host.questions.slice(1).map((q) => q.id) },
        ],
      },
    }),
  );
  await page.getByRole('button', { name: 'Group with AI' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apply topic' }).click();
  await page.getByRole('tab', { name: /Topics/ }).click();
  await expect(page.getByTestId('host-topic')).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('host-topic')).toHaveCount(0);
  await page.getByRole('tab', { name: /List/ }).click();
  await expect(page.getByTestId('host-question')).toHaveCount(3);
});

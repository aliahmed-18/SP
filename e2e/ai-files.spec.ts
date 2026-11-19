import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { AiKeyPointsResult } from '@getit/shared';
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
  test.skip(!!process.env.E2E_BASE_URL, 'server-side generation needs the fake AI (AI_FAKE=1)');
  const code = await startSession(page);
  let sent: { text: string; kinds: string[]; note: string } | undefined;
  // Look at what the browser sends (only text, read from the files here), then let it through.
  await page.route(`**/api/sessions/${code}/ai/generate`, async (r) => {
    sent = r.request().postDataJSON();
    await r.continue();
  });

  await page.getByRole('button', { name: 'AI generation' }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByTestId('ai-file-input')
    .setInputFiles(['lecture.pdf', 'slides.pptx', 'notes.docx', 'notes.html', 'old.ppt'].map(fixture));
  const files = dialog.getByTestId('ai-files');
  await expect(files.getByText('Text ready')).toHaveCount(4, { timeout: 15_000 });
  await expect(files).toContainText('Old .doc/.ppt files are not supported');

  // Picture-only slides and a scanned PDF: a clear message, never sent as empty "text".
  await dialog.getByTestId('ai-file-input').setInputFiles([fixture('pictures.pptx'), fixture('scanned.pdf')]);
  await expect(files.getByText('No readable text found')).toHaveCount(2, { timeout: 15_000 });

  await dialog.getByLabel('Note for the AI (optional)').fill('Focus on the main formulas');
  await dialog.getByRole('button', { name: 'Explain', exact: true }).click();
  await dialog.getByTestId('ai-generate').click();
  await expect(dialog).toBeHidden();

  expect(sent!.note).toBe('Focus on the main formulas');
  expect(sent!.kinds).toContain('EXPLAIN');
  for (const t of [
    'R squared equals r squared', // PDF
    'Correlation does not imply causation.', // Word
    'Table cell: r squared', // Word table
    'ما الفرق بين معامل الارتباط والميل؟', // Arabic in Word
    'Residuals sum to zero', // HTML
  ])
    expect(sent!.text).toContain(t);
  // PowerPoint (made with python-pptx; "Correlation" was dragged to the front): presentation order,
  // and each slide with its own speaker notes.
  const deck = sent!.text.slice(sent!.text.indexOf('--- slides.pptx ---'));
  const at = (t: string) => deck.indexOf(t);
  expect(at('Slide 1\nCorrelation')).toBeGreaterThan(0);
  expect(at('NOTE-C: r has no units.')).toBeGreaterThan(at('Slide 1'));
  expect(at('NOTE-C: r has no units.')).toBeLessThan(at('Slide 2\nLeast squares'));
  expect(at('NOTE-A')).toBeLessThan(at('Slide 3\nThe slope'));
  expect(at('NOTE-B: the slope has the units of y per unit of x.')).toBeGreaterThan(at('Slide 3'));
  expect(sent!.text).not.toContain('var x=1'); // HTML scripts and styles are dropped
  expect(sent!.text).not.toContain('color:red');

  // The drafts (incl. Explain) arrive in the list as AI drafts.
  const rows = page.getByTestId('activity-row');
  await expect(rows).toHaveCount(5, { timeout: 15_000 });
  await expect(page.getByTestId('ai-draft-badge')).toHaveCount(5);
  await expect(rows.filter({ hasText: 'Explain' }).first()).toBeVisible();
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

test('Explain: Grade with AI tags every answer in one click; summary; Undo', async ({ page, browser }) => {
  test.skip(!!process.env.E2E_BASE_URL, 'grading runs on the server with the fake AI (AI_FAKE=1)');
  const code = await startSession(page);
  await page.request.post(`/api/sessions/${code}/activities`, {
    data: { type: 'EXPLAIN', prompt: "What does the slope b tell you that r doesn't?" },
  });
  const phones = [await joinAs(browser, code), await joinAs(browser, code), await joinAs(browser, code)];
  const row = page.getByTestId('activity-row').first();
  await row.getByRole('button', { name: 'Launch' }).click();
  // A longer answer (more than the old 200-character limit) goes through too.
  const long =
    'The slope b tells you how much y changes for each one-unit increase in x, in the units of y. '.repeat(3);
  const texts = [long, 'Rise over run.', 'How strong the relationship is.'];
  for (const [i, p] of phones.entries()) {
    await p.getByRole('textbox', { name: 'Your answer' }).fill(texts[i]!);
    await p.getByRole('button', { name: 'Send' }).click();
    await expect(p.getByText('Answer sent')).toBeVisible();
  }
  await row.getByRole('button', { name: 'Close answers' }).click();
  await expect(row.getByTestId('explain-answers').getByRole('listitem')).toHaveCount(3);

  // One click: the server grades and tags; the list updates live (fake AI: 2 right, 1 misconception).
  await row.getByTestId('ai-grade').click();
  await expect(row.getByRole('button', { name: /Correct \(2\)/ })).toBeVisible({ timeout: 15_000 });
  await expect(row.getByRole('button', { name: /Misconception \(1\)/ })).toBeVisible();
  await expect(row.getByTestId('ai-grade-summary')).toContainText('Fake: confuses slope with strength');
  await expect(page.getByText('AI graded 3 answers')).toBeVisible();
  await expect(row.getByTestId('ai-grade')).toBeDisabled(); // nothing left untagged

  // Undo puts every answer back to "Not tagged".
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(row.getByRole('button', { name: /Not tagged \(3\)/ })).toBeVisible();

  // "Grade all with AI": every written answer of every closed Explain, in the background.
  await expect(page.getByTestId('ai-grade-all')).toContainText('3 written answers not graded yet');
  await page.getByTestId('ai-grade-all').getByRole('button', { name: 'Grade all with AI' }).click();
  await expect(page.getByTestId('ai-grade-job')).toContainText('AI is grading written answers');
  await expect(row.getByRole('button', { name: /Correct \(2\)/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('AI graded 3 written answers')).toBeVisible();
  await expect(page.getByTestId('ai-grade-all')).toBeHidden(); // nothing left to grade
});

test('Group with AI can be undone', async ({ page, browser }) => {
  test.skip(!!process.env.E2E_BASE_URL, 'grouping runs on the server with the fake AI (AI_FAKE=1)');
  const code = await startSession(page);
  const phones = [await joinAs(browser, code), await joinAs(browser, code), await joinAs(browser, code)];
  const qs = ['How do we get Sxy?', 'How do we compute b?', 'What is r?'];
  for (const [i, p] of phones.entries()) {
    await p.getByRole('textbox', { name: 'Your question' }).fill(qs[i]!);
    await p.getByRole('button', { name: 'Send' }).click();
    await expect(p.getByText('Question sent').last()).toBeVisible();
  }
  await page.getByTestId('ai-group').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Apply topic' }).click({ timeout: 15_000 });
  await page.getByRole('tab', { name: /Topics/ }).click();
  await expect(page.getByTestId('host-topic')).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('host-topic')).toHaveCount(0);
  await page.getByRole('tab', { name: /List/ }).click();
  await expect(page.getByTestId('host-question')).toHaveCount(3);
});

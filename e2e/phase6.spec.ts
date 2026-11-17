import { expect, test } from '@playwright/test';
import { ask, joinAs, startSession } from './helpers';

// Phase 6: Explain, End session, Take-away (editor → phones, personal review, image), Excel export.
test.skip(({ isMobile }) => isMobile, 'multi-device flow runs once (laptop project)');

test('Explain: answers (one blocked silently), tags, misconception on the projector', async ({
  page,
  browser,
  context,
}) => {
  const code = await startSession(page);
  await page
    .getByRole('button', { name: /Explain/ })
    .first()
    .click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Prompt').fill("In one sentence: what does the slope b tell you that r doesn't?");
  await dlg.getByLabel('Model answer').fill('SECRET: the change in y per unit of x.');
  await dlg.getByRole('button', { name: 'Save activity' }).click();
  await expect(dlg).toBeHidden();

  const proj = await context.newPage();
  await proj.goto(`/s/${code}/present`);
  const [p1, p2] = [await joinAs(browser, code), await joinAs(browser, code)];
  const row = page.getByTestId('activity-row').first();
  await row.getByRole('button', { name: 'Launch' }).click();

  await expect(proj.getByText('Write your answer on your phone')).toBeVisible();
  await expect(p1.getByText('Explain in your own words')).toBeVisible();
  expect(await p1.content()).not.toContain('SECRET');

  await p1.getByRole('textbox', { name: 'Your answer' }).fill('A bigger b means a stronger correlation.');
  await p1.getByRole('button', { name: 'Send' }).click();
  await p2.getByRole('textbox', { name: 'Your answer' }).fill('this is shit');
  await p2.getByRole('button', { name: 'Send' }).click();
  for (const p of [p1, p2]) await expect(p.getByText('Answer sent')).toBeVisible();
  await expect(row.getByTestId('answered-count')).toHaveText('2');
  await expect(page.getByTestId('flagged-count')).toContainText('1');

  // A refreshed phone stays on "Answer sent", even the one that was silently blocked.
  await p2.reload();
  await expect(p2.getByText('Answer sent')).toBeVisible();

  // Close → the instructor reads the stored answer (not the blocked one) and tags it.
  await row.getByRole('button', { name: 'Close answers' }).click();
  const answers = row.getByTestId('explain-answers');
  await expect(answers.getByRole('listitem')).toHaveCount(1);
  await expect(answers).toContainText('A bigger b means a stronger correlation.');
  await expect(proj.getByText('Answers collected:')).toBeVisible();
  await answers.getByRole('button', { name: 'Misconception' }).click();
  await answers.getByRole('button', { name: 'Show on projector' }).click();
  await expect(proj.getByText('“A bigger b means a stronger correlation.”')).toBeVisible();
  await answers.getByRole('button', { name: 'Stop showing' }).click();
  await expect(proj.getByText('Answers collected:')).toBeVisible();
});

test('End → Take-away editor → phones get it with their own review → image + Excel', async ({
  page,
  browser,
}) => {
  const code = await startSession(page);
  const res = await page.request.post(`/api/sessions/${code}/activities`, {
    data: {
      type: 'QUICK_CHECK',
      kind: 'MCQ',
      prompt: 'Which value of r shows the strongest linear relationship?',
      options: ['r = 0.45', 'r = −0.92'],
      correct: 1,
      explanation: 'Strength is the size of r, ignoring the sign.',
    },
  });
  expect(res.status()).toBe(201);
  const p1 = await joinAs(browser, code);

  // A question + topic for "What the class asked most".
  await ask(p1, 'How do we compute the slope?');
  await page.getByRole('tab', { name: /List/ }).click();
  await page.getByTestId('host-question').first().getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Group into topic' }).click();
  await page.getByRole('textbox', { name: 'New topic title' }).fill('Computing the slope');
  await page.getByRole('button', { name: 'Create topic' }).click();
  await p1.getByRole('button', { name: /Me too/ }).click();

  // Quick Check: p1 answers wrong and sure → it will be in their personal review.
  const row = page.getByTestId('activity-row').first();
  await row.getByRole('button', { name: 'Launch' }).click();
  await p1.getByRole('button', { name: /r = 0.45/ }).click();
  await p1.getByRole('button', { name: 'Sure', exact: true }).click();
  await row.getByRole('button', { name: 'Close and show answer' }).click();
  await expect(p1.getByText('Not quite — here’s why')).toBeVisible();

  // End the session.
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'End session' }).click();
  await page.getByRole('button', { name: 'End session' }).click();
  await expect(p1.getByText('The instructor is preparing your Take-away.', { exact: false })).toBeVisible();

  // Take-away editor: topic pre-selected, fill its reply, two key points, publish.
  const editor = page.getByTestId('takeaway-editor');
  await expect(editor.getByRole('checkbox', { name: /Computing the slope/ })).toBeChecked();
  await editor
    .getByLabel('Key point 1', { exact: true })
    .fill('The slope b is the change in y for each one-unit increase in x.');
  await editor.getByRole('button', { name: 'Add key point' }).click();
  await editor.getByLabel('Key point 2', { exact: true }).fill('Correlation is not causation.');
  await editor.getByLabel('Written reply for Computing the slope').fill('Use b = Sxy / Sxx.');
  await editor.getByRole('button', { name: 'Publish' }).click();
  await expect(editor.getByText('Published')).toBeVisible();

  // The phone switches to the Take-away by itself.
  const ta = p1.getByTestId('takeaway');
  await expect(ta.getByRole('heading', { name: "Today's key points" })).toBeVisible();
  await expect(ta).toContainText('Correlation is not causation.');
  await expect(ta).toContainText('Use b = Sxy / Sxx.');
  await expect(ta).toContainText('1 classmate had this question too');
  const item = ta.getByTestId('review-item');
  await expect(item).toContainText('Which value of r shows the strongest linear relationship?');
  await expect(item).toContainText('r = 0.45');
  await expect(item).toContainText('B · r = −0.92');
  await expect(ta).toContainText('This page disappears 24 hours after the lecture ends');

  // Save as image → a PNG download.
  const [png] = await Promise.all([
    p1.waitForEvent('download'),
    p1.getByRole('button', { name: 'Save as image' }).click(),
  ]);
  expect(png.suggestedFilename()).toBe(`getit-takeaway-${code}.png`);

  // Instructor: Download results → .xlsx.
  const [xlsx] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Download results' }).click(),
  ]);
  expect(xlsx.suggestedFilename()).toMatch(
    /^getit-linear-regression-and-correlation-\d{4}-\d{2}-\d{2}\.xlsx$/,
  );
});

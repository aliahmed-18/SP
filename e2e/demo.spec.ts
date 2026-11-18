import { devices, expect, test, type Page } from '@playwright/test';
import { ask, joinAs, startSession } from './helpers';

// docs/07-demo-script.md end to end: 1 host + 1 projector + 3 phones, in presentation order.
// docs/09: one phone goes offline for 30 s during a Quick Check and recovers without a duplicate answer.
test.skip(({ isMobile }) => isMobile, 'multi-device flow runs once (laptop project)');
test.setTimeout(240_000);

const ACTIVITIES = [
  {
    type: 'QUICK_CHECK',
    kind: 'MCQ',
    prompt: 'Which value of r shows the strongest linear relationship?',
    options: ['r = 0.45', 'r = −0.92', 'r = 0.80', 'r = 0'],
    correct: 1,
    explanation: 'Strength is the size of r, ignoring the sign: |−0.92| is the largest.',
  },
  {
    type: 'EXPLAIN',
    prompt: "In one sentence: what does the slope b tell you that r doesn't?",
    modelAnswer: 'b is the change in y per unit of x, in the units of y.',
  },
];

const key = (p: Page, k: string) => p.locator('body').press(k);

test('the demo, start to finish', async ({ page, context, browser }) => {
  // 2. Start the session live; activities are ready (as from the seeded templates).
  const code = await startSession(page, 'Linear regression and correlation');
  for (const data of ACTIVITIES) {
    expect((await page.request.post(`/api/sessions/${code}/activities`, { data })).status()).toBe(201);
  }
  const [proj] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: 'Start presenting' }).click(),
  ]);
  await proj.setViewportSize({ width: 1920, height: 1080 });
  await expect(proj.getByText('Welcome! Scan to join the session')).toBeVisible();
  // Professors scan the QR with their own phones → the joined count climbs on the projector.
  const phones = [await joinAs(browser, code), await joinAs(browser, code), await joinAs(browser, code)];
  await expect(proj.getByTestId('present-joined')).toHaveText('3');
  const [p1, p2, p3] = phones as [Page, Page, Page];

  // 3. Ask: anonymous questions (one Arabic) live on the host; a rude one disappears silently.
  await ask(p1, 'How do we get Sxy from the table?');
  await ask(p2, 'ما الفرق بين معامل الارتباط والميل؟');
  await ask(p3, 'Why does the slope become negative when price goes up?');
  await page.waitForTimeout(5_100);
  await ask(p3, 'this is shit');
  await page.getByRole('tab', { name: /List/ }).click();
  await expect(page.getByTestId('host-question')).toHaveCount(3);
  await expect(page.getByTestId('flagged-count')).toContainText('1');
  // Group two similar questions → topic → Me too → reply in writing → phones.
  for (const t of ['Sxy', 'slope become negative']) {
    await page.getByTestId('host-question').filter({ hasText: t }).getByRole('checkbox').check();
  }
  await page.getByRole('button', { name: 'Group into topic' }).click();
  await page.getByRole('textbox', { name: 'New topic title' }).fill('Computing the slope');
  await page.getByRole('button', { name: 'Create topic' }).click();
  for (const p of phones)
    await p
      .getByTestId('student-topic')
      .getByRole('button', { name: /Me too/ })
      .click();
  await page.getByRole('tab', { name: /Topics/ }).click();
  await expect(page.getByTestId('host-topic')).toContainText('3 tapped “Me too”');
  await page.getByRole('button', { name: 'Reply in writing' }).click();
  await page.getByLabel('Reply in writing').fill('Use b = Sxy / Sxx.');
  await page.getByRole('button', { name: 'Send reply' }).click();
  for (const p of phones) await expect(p.getByTestId('student-topic')).toContainText('Use b = Sxy / Sxx.');

  // 4. Quick Check on the projector: discuss first (auto-reveal off), vote again, then reveal.
  await proj.bringToFront();
  await proj.getByRole('button', { name: 'Projector settings' }).click();
  await proj.getByRole('switch', { name: /Show the answer as soon/ }).click();
  await proj.keyboard.press('Escape');
  await expect(proj.getByRole('dialog')).toBeHidden();
  await key(proj, 'ArrowRight');
  for (const p of phones) await expect(p.getByText('Pick one answer')).toBeVisible();
  // p3 answers, then loses the network for 30 s while the others answer.
  await p3.getByRole('button', { name: /r = 0.80/ }).click();
  await expect(p3.getByTestId('answer-sent')).toBeVisible();
  await p3.context().setOffline(true);
  await expect(p3.getByTestId('reconnecting-banner')).toBeVisible({ timeout: 15_000 });
  await p1.getByRole('button', { name: /r = −0.92/ }).click();
  await p1.getByRole('button', { name: 'Sure', exact: true }).click();
  await p2.getByRole('button', { name: /r = 0.45/ }).click();
  await p2.getByRole('button', { name: 'Sure', exact: true }).click();
  await expect(proj.getByTestId('present-answered')).toHaveText('3');
  await p3.waitForTimeout(30_000);
  await p3.context().setOffline(false);
  await expect(p3.getByTestId('reconnecting-banner')).toBeHidden({ timeout: 30_000 });
  await expect(p3.getByTestId('answer-sent')).toBeVisible(); // same screen as before the drop
  await expect(proj.getByTestId('present-answered')).toHaveText('3'); // no duplicate answer
  // Close → results + suggestion → R: vote again → everyone votes → reveal.
  await key(proj, 'ArrowRight');
  await expect(proj.getByTestId('present-suggestion')).toBeVisible();
  await key(proj, 'r');
  for (const p of phones) await expect(p.getByText('Vote again · round 2')).toBeVisible();
  for (const p of phones) await p.getByRole('button', { name: /r = −0.92/ }).click();
  await expect(proj.getByTestId('present-answered')).toHaveText('3');
  await key(proj, 'ArrowRight'); // close round 2
  await expect(proj.getByText(/Round 1: .* → {2}Round 2/)).toBeVisible();
  await key(proj, 'ArrowRight'); // show answer
  await expect(proj.getByText('Correct', { exact: true })).toBeVisible();
  for (const p of phones) await expect(p.getByText('You got it')).toBeVisible();
  for (const p of phones) await p.getByRole('button', { name: 'Back to the lecture' }).click();

  // 5. Explain: phones write one sentence; tag a misconception; show it on the projector.
  await key(proj, 'ArrowRight');
  await expect(proj.getByText('Write your answer on your phone')).toBeVisible();
  const sentences = [
    'b is the change in y for each unit of x.',
    'b shows how strong the relationship is.',
    'The slope has units.',
  ];
  for (const [i, p] of phones.entries()) {
    await p.getByRole('textbox', { name: 'Your answer' }).fill(sentences[i]!);
    await p.getByRole('button', { name: 'Send' }).click();
    await expect(p.getByText('Answer sent')).toBeVisible();
  }
  await key(proj, 'ArrowRight'); // close answers
  await expect(proj.getByText('Answers collected:')).toBeVisible();
  await page.bringToFront();
  const explainRow = page.getByTestId('activity-row').nth(1);
  const wrong = explainRow
    .getByTestId('explain-answers')
    .getByRole('listitem')
    .filter({ hasText: 'how strong' });
  await wrong.getByRole('button', { name: 'Misconception' }).click();
  await wrong.getByRole('button', { name: 'Show on projector' }).click();
  await expect(proj.getByText('“b shows how strong the relationship is.”')).toBeVisible();
  await wrong.getByRole('button', { name: 'Stop showing' }).click();

  // 6. End + Take-away: key points → Publish → phones show it with their own review → image.
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'End session' }).click();
  await page.getByRole('button', { name: 'End session' }).click();
  await expect(proj.getByRole('heading', { name: 'The lecture has ended' })).toBeVisible();
  const editor = page.getByTestId('takeaway-editor');
  await editor
    .getByLabel('Key point 1', { exact: true })
    .fill('The slope b is the change in y for each one-unit increase in x.');
  await editor.getByRole('button', { name: 'Add key point' }).click();
  await editor.getByLabel('Key point 2', { exact: true }).fill('Correlation is not causation.');
  await editor.getByRole('button', { name: 'Publish' }).click();
  for (const p of phones)
    await expect(p.getByTestId('takeaway')).toContainText('Correlation is not causation.');
  // p2 was sure and wrong in round 1 but right in round 2 → nothing to revisit; the review is per phone.
  await expect(p2.getByTestId('takeaway')).toContainText('Your Quick Check review');
  const [png] = await Promise.all([
    p1.waitForEvent('download'),
    p1.getByRole('button', { name: 'Save as image' }).click(),
  ]);
  expect(png.suggestedFilename()).toMatch(/\.png$/);

  // 7. Dashboard + Excel.
  await page.getByRole('button', { name: /Download results/ }).click();
  const [xlsx] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: /Excel workbook/ }).click(),
  ]);
  expect(xlsx.suggestedFilename()).toMatch(/\.xlsx$/);
  await page.goto('/dashboard');
  // This session's own row (other runs may have left sessions with the same title).
  await expect(page.locator(`main a[href="/s/${code}/host"]`)).toContainText('Ended');

  // An iPhone-sized phone still renders the Take-away (Safari-like viewport).
  const iphone = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage();
  await iphone.goto(`/join/${code}`);
  await expect(iphone.getByTestId('takeaway')).toBeVisible();
});

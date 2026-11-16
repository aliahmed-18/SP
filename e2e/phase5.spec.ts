import { expect, test, type Page } from '@playwright/test';
import { joinAs, startSession } from './helpers';

// Phase 5: projector runs activities in order with the keyboard / a clicker.
test.skip(({ isMobile }) => isMobile, 'multi-device flow runs once (laptop project)');

const MCQ = (prompt: string) => ({
  type: 'QUICK_CHECK',
  kind: 'MCQ',
  prompt,
  options: ['r = 0.45', 'r = −0.92', 'r = 0.80'],
  correct: 1,
  explanation: 'Strength is the size of r, ignoring the sign.',
});

const press = async (p: Page, key: string) => {
  await p.locator('body').press(key);
};

test('run in class: keys, undo, blank, vote again, timer, topic on projector, refresh', async ({
  page,
  browser,
  context,
}) => {
  const code = await startSession(page);
  for (const prompt of ['Q one: strongest r?', 'Q two: strongest r again?']) {
    const res = await page.request.post(`/api/sessions/${code}/activities`, { data: MCQ(prompt) });
    expect(res.status()).toBe(201);
  }
  const [p1, p2] = [await joinAs(browser, code), await joinAs(browser, code)];

  const proj = await context.newPage();
  await proj.setViewportSize({ width: 1920, height: 1080 });
  await proj.goto(`/s/${code}/present`);
  await expect(proj.getByTestId('present-joined')).toHaveText('2');
  await expect(proj.getByTestId('present-next')).toContainText('Start first activity');

  // → opens Q1 everywhere; results hidden; count climbs.
  await press(proj, 'ArrowRight');
  await expect(proj.getByRole('heading', { name: 'Q one: strongest r?' })).toBeVisible();
  await expect(proj.getByText('Q1 / 2')).toBeVisible();
  await expect(proj.getByText('Results hidden')).toBeVisible();
  await expect(p1.getByRole('heading', { name: 'Q one: strongest r?' })).toBeVisible();
  await p1.getByRole('button', { name: /r = −0.92/ }).click();
  await p2.getByRole('button', { name: /r = 0.45/ }).click();
  await expect(proj.getByTestId('present-answered')).toHaveText('2');

  // Refresh the projector mid-question: same screen, same count.
  await proj.reload();
  await expect(proj.getByTestId('present-answered')).toHaveText('2');

  // → close + show answer (auto-reveal default on).
  await press(proj, 'ArrowRight');
  await expect(proj.getByText('Correct', { exact: true })).toBeVisible();
  await expect(proj.getByText('Strength is the size of r, ignoring the sign.')).toBeVisible();
  await expect(p1.getByText('You got it')).toBeVisible();
  await expect(p2.getByText('Not quite — here’s why')).toBeVisible();

  // ← undo: REVEALED → CLOSED (no correct mark) → LIVE again.
  await press(proj, 'ArrowLeft');
  await expect(proj.getByText('Correct', { exact: true })).toBeHidden();
  await expect(proj.getByTestId('present-next')).toContainText('Show answer');
  await press(proj, 'ArrowLeft');
  await expect(proj.getByText('Results hidden')).toBeVisible();

  // B blanks the screen, B again shows it.
  await press(proj, 'b');
  await expect(proj.getByTestId('present-next')).toBeHidden();
  await press(proj, 'b');
  await expect(proj.getByText('Results hidden')).toBeVisible();

  // Settings: auto-reveal off + 30 s timer, then finish Q1 and open Q2 with a running timer.
  await proj.getByRole('button', { name: 'Projector settings' }).click();
  await proj.getByRole('button', { name: '30 s' }).click();
  await proj.getByRole('switch', { name: 'Show the answer as soon as a question closes' }).click();
  await proj.keyboard.press('Escape'); // closes the dialog only
  await expect(proj.getByRole('dialog')).toBeHidden();
  await expect(proj.getByTestId('present-next')).toContainText('Close question');
  await press(proj, 'ArrowRight'); // close (no reveal)
  await expect(proj.getByTestId('present-next')).toContainText('Show answer');
  await press(proj, 'ArrowRight'); // show answer
  await expect(proj.getByText('Correct', { exact: true })).toBeVisible();
  await press(proj, 'ArrowRight'); // next question
  await expect(proj.getByRole('heading', { name: 'Q two: strongest r again?' })).toBeVisible();
  const timer = proj.getByTestId('present-timer');
  await expect(timer).toHaveText(/0:(2\d|30)/);
  await timer.click();
  await expect(timer).toHaveText(/0:(3\d|4\d)/);

  // Close without reveal → R = vote again (round 2) on phones.
  await p1.getByRole('button', { name: /r = 0.45/ }).click();
  await press(proj, 'ArrowRight');
  await expect(proj.getByTestId('present-suggestion')).toBeVisible();
  await press(proj, 'r');
  await expect(p1.getByText('Vote again · round 2')).toBeVisible();
  await expect(proj.getByText('Vote again · round 2')).toBeVisible();

  // Topic from the host's Q&A pushed to the projector, then stopped.
  await p2.getByRole('button', { name: 'Ask' }).click();
  await p2.getByRole('textbox', { name: 'Your question' }).fill('Why does the sign not matter?');
  await p2.getByRole('button', { name: 'Send' }).click();
  await page.getByRole('tab', { name: /List/ }).click();
  await page.getByTestId('host-question').first().getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Group into topic' }).click();
  await page.getByRole('textbox', { name: 'New topic title' }).fill('Sign of r');
  await page.getByRole('button', { name: 'Create topic' }).click();
  await page.getByRole('tab', { name: /Topics/ }).click();
  await page.getByRole('button', { name: 'Show on projector' }).click();
  await expect(proj.getByRole('heading', { name: 'Sign of r' })).toBeVisible();
  await expect(proj.getByText('Why does the sign not matter?')).toBeVisible();
  await page.getByRole('button', { name: 'Stop showing' }).click();
  await expect(proj.getByText('Vote again · round 2')).toBeVisible();

  // Finish: close, show answer, wrap.
  await press(proj, 'ArrowRight');
  await expect(proj.getByTestId('present-next')).toContainText('Show answer');
  await press(proj, 'ArrowRight');
  await expect(proj.getByTestId('present-next')).toContainText('Finish');
  await press(proj, 'ArrowRight');
  await expect(proj.getByRole('heading', { name: 'That’s a wrap' })).toBeVisible();

  // The QR chip brings the join screen back for latecomers; Esc leaves the projector.
  await proj.getByTestId('present-join').click();
  await expect(proj.getByText('Welcome! Scan to join the session')).toBeVisible();
  await press(proj, 'Escape');
  await expect(proj).toHaveURL(new RegExp(`/s/${code}/host$`));
});

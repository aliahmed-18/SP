import { expect, test } from '@playwright/test';
import { ask, joinAs, startSession } from './helpers';

// Phase 3: anonymous Ask → live host list → stealth moderation → topics → Me too → reply on phones.
test.skip(({ isMobile }) => isMobile, 'multi-device flow runs once (laptop project)');

test('ask, moderate, group, Me too, reply — live on every screen', async ({ page, browser, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const code = await startSession(page);
  await page.getByRole('tab', { name: /List/ }).click();

  const p1 = await joinAs(browser, code);
  const p2 = await joinAs(browser, code);

  // Questions arrive live, newest first, with no identity.
  await ask(p1, 'Why does the slope become negative when price goes up?');
  await ask(p2, 'ما الفرق بين معامل الارتباط والميل؟');
  const items = page.getByTestId('host-question');
  await expect(items).toHaveCount(2);
  await expect(items.first()).toContainText('ما الفرق بين معامل الارتباط والميل؟');
  await expect(page.getByTestId('question-count')).toHaveText('2 questions');
  // Arabic renders right-to-left inside its bubble.
  await expect(items.first().locator('p[dir="auto"]')).toHaveJSProperty('dir', 'auto');

  // The phone's "My questions" keeps what it sent.
  await p1.getByText('My questions (1)').click();
  await expect(p1.getByTestId('my-questions')).toContainText('Why does the slope become negative');

  // Stealth moderation: p2's rude question looks sent, never reaches the host, flagged + 1.
  await p2.waitForTimeout(5100); // client-side 5 s gap
  await ask(p2, 'this is shit');
  await expect(page.getByTestId('flagged-count')).toContainText('1');
  await expect(items).toHaveCount(2);
  await expect(page.getByText('this is shit')).toHaveCount(0);
  await expect(p2.getByText('My questions (2)')).toBeVisible();

  // Group both questions into a topic.
  await items.nth(0).getByRole('checkbox').check();
  await items.nth(1).getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Group into topic' }).click();
  await page.getByRole('textbox', { name: 'New topic title' }).fill('Computing the slope');
  await page.getByRole('button', { name: 'Create topic' }).click();
  await expect(items.first()).toContainText('Computing the slope');

  // Phones see the topic (title only) and tap Me too → host count rises.
  for (const p of [p1, p2]) {
    const topic = p.getByTestId('student-topic');
    await expect(topic).toContainText('Computing the slope');
    await expect(topic).not.toContainText('Why does the slope');
    await topic.getByRole('button', { name: /Me too/ }).click();
  }
  await expect(p1.getByRole('button', { name: /Me too/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(p1.getByRole('button', { name: /Me too/ })).toContainText('2');

  await page.getByRole('tab', { name: /Topics/ }).click();
  const hostTopic = page.getByTestId('host-topic');
  await expect(hostTopic).toContainText('2 asked · 2 tapped “Me too”');
  await expect(hostTopic).toContainText('Next up');

  // Undo Me too on p2.
  await p2.getByRole('button', { name: /Me too/ }).click();
  await expect(hostTopic).toContainText('1 tapped “Me too”');

  // Reply in writing → appears on phones.
  await hostTopic.getByRole('button', { name: 'Reply in writing' }).click();
  await page.getByLabel('Reply in writing').fill('Use b = Sxy / Sxx.');
  await page.getByRole('button', { name: 'Send reply' }).click();
  await expect(p1.getByTestId('student-topic')).toContainText('Replied');
  await expect(p1.getByTestId('student-topic')).toContainText('Use b = Sxy / Sxx.');
  await expect(page.getByText('Addressed: 1 of 1 topics')).toBeVisible();

  // A refreshed phone comes back exactly as it was: Me too pressed, my questions, draft kept.
  await p1.getByRole('textbox', { name: 'Your question' }).fill('half-written draft');
  await p1.reload();
  await expect(p1.getByRole('textbox', { name: 'Your question' })).toHaveValue('half-written draft');
  await expect(p1.getByRole('button', { name: /Me too/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(p1.getByText('My questions (1)')).toBeVisible();

  // New part: the list starts fresh; part 1 collapses with its counts.
  await page.getByRole('tab', { name: /List/ }).click();
  await page.getByRole('button', { name: 'New part' }).click();
  await page.getByRole('button', { name: 'Start new part' }).click();
  await expect(page.getByText('Questions: 2 · Flagged: 1')).toBeVisible();
  await expect(page.getByText('No questions in this part yet')).toBeVisible();
  await p1.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByTestId('host-question').first()).toContainText('half-written draft');

  // Remove an inappropriate question → gone, flagged + 1.
  await page.getByTestId('host-question').first().getByRole('button', { name: 'Question options' }).click();
  await page.getByRole('menuitem', { name: /Remove \(inappropriate\)/ }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByTestId('flagged-count')).toContainText('2');

  // Copy questions → TSV for Excel.
  await page.getByRole('button', { name: 'Copy questions' }).click();
  const tsv = await page.evaluate(() => navigator.clipboard.readText());
  expect(tsv.split('\n')[0]).toBe('Part\tComputing the slope\tUngrouped');
  expect(tsv).toContain('ما الفرق بين معامل الارتباط والميل؟');
});

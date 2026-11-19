import { rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { startSession } from './helpers';

// Laptop demo: phones can't open "localhost". The host page says so; once `npm run share` saved a
// public tunnel address, the QR and the projector use it (the tunnel itself isn't started here).
test.skip(({ isMobile }) => isMobile, 'instructor flow runs once (laptop project)');
test.skip(!!process.env.E2E_BASE_URL, 'reads the local .getit-public-url file');

const FILE = fileURLToPath(new URL('../.getit-public-url', import.meta.url));
test.afterEach(() => rmSync(FILE, { force: true }));

test('localhost warning, then the QR and projector use the shared public address', async ({
  page,
  context,
}) => {
  rmSync(FILE, { force: true });
  const code = await startSession(page);
  await expect(page.getByTestId('local-only')).toContainText("Phones can't open “localhost”");
  await expect(page.getByTestId('local-only')).toContainText('npm run share');

  writeFileSync(FILE, 'https://lecture-demo.trycloudflare.com');
  await page.reload();
  await expect(page.getByTestId('local-only')).toHaveCount(0);
  await expect(page.getByTestId('public-link')).toContainText('lecture-demo.trycloudflare.com');
  await page.getByRole('button', { name: 'QR' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(`https://lecture-demo.trycloudflare.com/join/${code}`);
  await expect(dialog).toContainText('Or open lecture-demo.trycloudflare.com and enter the code.');

  const proj = await context.newPage();
  await proj.goto(`/s/${code}/present`);
  await expect(proj.getByText('or go to lecture-demo.trycloudflare.com and enter the code')).toBeVisible();
});

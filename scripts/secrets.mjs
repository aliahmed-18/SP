// npm run secrets — replace the example JWT_SECRET / DEVICE_SALT in .env with strong random values.
// Needed before the app is reachable from outside (npm run share, hosting): the example values are
// public in the repository, so anyone could forge an instructor login with them.
// After changing them: restart the server and log in again. Do it before a lecture, not during one
// (a new DEVICE_SALT makes phones that already joined count as new devices).
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ENV = fileURLToPath(new URL('../.env', import.meta.url));
if (!existsSync(ENV)) {
  console.error('\n  No .env file yet. Run: copy .env.example .env   (macOS/Linux: cp .env.example .env)\n');
  process.exit(1);
}
const force = process.argv.includes('--force');
let text = readFileSync(ENV, 'utf8');
let changed = 0;
for (const name of ['JWT_SECRET', 'DEVICE_SALT']) {
  const re = new RegExp(`^${name}=(.*)$`, 'm');
  const current = re.exec(text)?.[1]?.trim() ?? '';
  if (!force && current && !current.includes('change-me')) continue;
  const value = randomBytes(32).toString('base64url');
  text = re.test(text) ? text.replace(re, `${name}=${value}`) : `${text.trimEnd()}\n${name}=${value}\n`;
  changed++;
}
writeFileSync(ENV, text);
console.log(
  changed
    ? `\n  ${changed} secret(s) replaced with strong random values in .env.\n  Restart the server (Ctrl + C, then npm run dev) and log in again.\n`
    : '\n  Your secrets are already custom. Nothing changed (use --force to replace them anyway).\n',
);

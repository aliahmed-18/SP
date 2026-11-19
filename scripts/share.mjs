// npm run share — let phones reach Getit running on this laptop, through a free Cloudflare quick tunnel
// (no account, https, works on any network incl. campus Wi-Fi). The public address is saved to
// .getit-public-url so the QR and the projector use it automatically; it is removed when this stops.
//
//   npm run share              → shares the dev app (:5173) if it is running, else the production app (:4000)
//   npm run share -- 4000      → share a specific local port
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FILE = fileURLToPath(new URL('../.getit-public-url', import.meta.url));

async function up(port) {
  try {
    await fetch(`http://localhost:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
    return true;
  } catch {
    return false;
  }
}

// 1. The example secrets in .env.example are public: with them, anyone on the internet could forge an
//    instructor login. Refuse to open the app to the internet until they are replaced.
const ENV = fileURLToPath(new URL('../.env', import.meta.url));
const envText = existsSync(ENV) ? readFileSync(ENV, 'utf8') : '';
if (/^(JWT_SECRET|DEVICE_SALT)=.*change-me/m.test(envText)) {
  console.error(`
  Not sharing yet: your .env still uses the example secrets from the repository, so anyone could fake
  an instructor login once the app is on the internet. Fix it once (before the lecture):

    npm run secrets

  then restart the app and run npm run share again.
`);
  process.exit(1);
}

/** The production build answers "/" with the app itself (the dev API server doesn't). */
async function production(port) {
  try {
    const r = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1500) });
    return r.ok && (await r.text()).includes('id="root"'); // the app shell, not an error page
  } catch {
    return false;
  }
}

// 2. Prefer the production build (npm run build && npm start): the dev server also exposes development
//    tools and source files, which shouldn't be on the internet.
const arg = process.argv[2];
const port = arg ? Number(arg) : (await production(4000)) ? 4000 : (await up(5173)) ? 5173 : null;
if (!port) {
  console.error(
    '\n  Getit is not running. Start it first: npm run build, then npm start (or npm run dev).\n',
  );
  process.exit(1);
}
if (port === 5173)
  console.warn(`  Note: you are sharing the DEVELOPMENT server. Fine for a quick test; for a real lecture use
  the production build instead (it is also faster):  npm run build  then  npm start  then  npm run share
`);

const clean = () => rmSync(FILE, { force: true });
clean();
console.log(`\n  Sharing http://localhost:${port} through a Cloudflare tunnel…\n`);
const child = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

child.on('error', (err) => {
  if (err.code === 'ENOENT') {
    console.error(`  "cloudflared" is not installed. Install it once, then run npm run share again:

    Windows:  winget install --id Cloudflare.cloudflared      (then open a new terminal)
    macOS:    brew install cloudflared
    Linux:    https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
`);
  } else console.error(err);
  process.exit(1);
});

let shown = false;
const watch = (chunk) => {
  const url = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(String(chunk))?.[0];
  if (!url || shown) return;
  shown = true;
  writeFileSync(FILE, url);
  console.log(`  ┌──────────────────────────────────────────────────────────────┐
  │  Phones can now join at:                                       │
  │  ${url.padEnd(60)}│
  └──────────────────────────────────────────────────────────────┘

  The QR code and the projector already use this address — no restart needed.
  Keep this window open during the lecture. Ctrl + C stops sharing.

  Safety: only this app is reachable (no other files or ports on this laptop), and your home/IP
  address is not shown — phones see only the trycloudflare.com address. Anyone with the link can
  open the login page: use your own instructor account, not the public demo password.
`);
};
child.stdout.on('data', watch);
child.stderr.on('data', watch);

const stop = () => {
  clean();
  child.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code) => {
  clean();
  if (!shown) console.error('  The tunnel stopped before it was ready. Check your internet and try again.');
  process.exit(code ?? 0);
});

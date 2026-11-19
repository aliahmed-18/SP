// npm run share — let phones reach Getit running on this laptop, through a free Cloudflare quick tunnel
// (no account, https, works on any network incl. campus Wi-Fi). The public address is saved to
// .getit-public-url so the QR and the projector use it automatically; it is removed when this stops.
//
//   npm run share              → shares the dev app (:5173) if it is running, else the production app (:4000)
//   npm run share -- 4000      → share a specific local port
import { spawn } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
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

const arg = process.argv[2];
const port = arg ? Number(arg) : (await up(5173)) ? 5173 : (await up(4000)) ? 4000 : null;
if (!port) {
  console.error('\n  Getit is not running. Start it first (npm run dev, or npm run build && npm start).\n');
  process.exit(1);
}

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

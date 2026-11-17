// Pre-demo smoke test against a running deployment (docs/08 checklist):
//   node scripts/smoke.mjs https://your-app.onrender.com
// Checks: HTTPS, the app page, /api/health (DB), security headers, a real WebSocket through the host's
// proxy (a bogus join code must be refused with SESSION_NOT_FOUND), and how long the first request took
// (a sleeping free-tier service takes ~1 min — wake it 10 minutes before the demo).
import { io } from 'socket.io-client';

const base = (process.argv[2] ?? 'http://localhost:4000').replace(/\/$/, '');
let failed = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};

const t0 = Date.now();
const page = await fetch(base + '/').catch((e) => ({
  ok: false,
  status: e.message,
  headers: new Headers(),
  text: async () => '',
}));
const firstMs = Date.now() - t0;
check(
  page.ok,
  'App page loads',
  `${page.status}, ${firstMs} ms${firstMs > 5000 ? ' (slow: was the service asleep?)' : ''}`,
);
check(
  base.startsWith('https://') || base.includes('localhost'),
  'HTTPS',
  base.startsWith('https://') ? 'yes' : 'not HTTPS (fine only on localhost)',
);
const html = page.ok ? await page.text() : '';
check(html.includes('<div id="root">'), 'Serves the built client');
check(!!page.headers.get('content-security-policy'), 'Content-Security-Policy header');

const health = await fetch(base + '/api/health')
  .then((r) => r.json())
  .catch(() => null);
check(health?.ok === true && health?.db === true, '/api/health', JSON.stringify(health));

const deep = await fetch(base + '/join/ABCDE');
check(deep.ok, 'Deep link /join/CODE (what the QR opens) serves the app', String(deep.status));

const ws = await new Promise((resolve) => {
  const s = io(base, {
    auth: { role: 'student', code: 'ZZZZZ', deviceId: '7c9e6679-7425-40de-944b-e07fc1f90ae7' },
    transports: ['websocket'],
    reconnection: false,
    timeout: 10000,
  });
  const done = (r) => {
    s.close();
    resolve(r);
  };
  s.on('connect_error', (e) => done(e.message));
  s.on('connect', () => done('connected?!'));
  setTimeout(() => done('timeout'), 12000);
});
check(ws === 'SESSION_NOT_FOUND', 'WebSocket reaches the server (unknown code refused properly)', ws);

console.log(
  failed ? `\n${failed} check(s) failed.` : '\nAll checks passed. Now join from a phone on mobile data.',
);
process.exit(failed ? 1 : 0);

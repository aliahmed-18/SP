// Load test (Phase 7): N simulated students join one session, ask questions and answer a Quick Check at
// the same moment, over real Socket.io connections — like a class of phones. Prints latencies and checks
// that every answer and question arrived exactly once.
//
//   npm run load-test -- [baseUrl] [students]
//   npm run load-test -- http://localhost:4000 60
//   npm run load-test -- https://your-app.onrender.com 120
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, HostState, ServerToClientEvents } from '@getit/shared';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
const base = (process.argv[2] ?? 'http://localhost:4000').replace(/\/$/, '');
const students = Number(process.argv[3] ?? 60);
const ACCOUNT = { name: 'Load Test', email: 'load-test@getit.app', password: 'load-test-password' };

let cookie = '';
async function http<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0]!;
  const text = await res.text();
  if (!res.ok)
    throw Object.assign(new Error(`${method} ${path} → ${res.status} ${text}`), { status: res.status });
  return (text ? JSON.parse(text) : undefined) as T;
}

const connect = (auth: object): Promise<Client> =>
  new Promise((resolve, reject) => {
    const c: Client = io(base, { auth, transports: ['websocket'], reconnection: false, forceNew: true });
    c.once('connect', () => resolve(c));
    c.once('connect_error', reject);
  });

const now = () => performance.now();
function summary(ms: number[]) {
  const s = [...ms].sort((a, b) => a - b);
  const at = (p: number) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
  return `p50 ${at(50).toFixed(0)} ms · p95 ${at(95).toFixed(0)} ms · max ${s[s.length - 1]!.toFixed(0)} ms`;
}

async function main() {
  console.log(`Getit load test → ${base} with ${students} students\n`);
  try {
    await http('POST', '/auth/register', ACCOUNT);
  } catch (err) {
    if ((err as { status?: number }).status !== 409) throw err;
    await http('POST', '/auth/login', { email: ACCOUNT.email, password: ACCOUNT.password });
  }
  const session = await http<{ id: string; code: string }>('POST', '/sessions', {
    topic: `Load test ${new Date().toISOString()}`,
  });
  const activity = await http<{ id: string }>('POST', `/sessions/${session.code}/activities`, {
    type: 'QUICK_CHECK',
    kind: 'MCQ',
    prompt: 'Load test question',
    options: ['A', 'B', 'C', 'D'],
    correct: 1,
    explanation: 'Load test.',
  });
  const { token } = await http<{ token: string }>('GET', '/auth/socket-token');
  const host = await connect({ role: 'host', code: session.code, token });
  let lastStats = 0;
  host.on('activity:stats', (s) => (lastStats = s.responses));
  let statsEvents = 0;
  host.on('activity:stats', () => statsEvents++);

  // 1. Everyone joins at once.
  let t = now();
  const joinTimes: number[] = [];
  const phones = await Promise.all(
    Array.from({ length: students }, async () => {
      const t0 = now();
      const c = await connect({ role: 'student', code: session.code, deviceId: randomUUID() });
      await new Promise((r) => c.once('state:student', r));
      joinTimes.push(now() - t0);
      return c;
    }),
  );
  console.log(
    `Join (connect + snapshot), ${students} at once: ${summary(joinTimes)} · total ${(now() - t).toFixed(0)} ms`,
  );

  // 2. Launch, then every phone answers at the same moment.
  const launched = Promise.all(phones.map((c) => new Promise((r) => c.once('activity:student', r))));
  t = now();
  const ack = await host.timeout(10_000).emitWithAck('activity:launch', { activityId: activity.id });
  if (!ack.ok) throw new Error(`launch failed: ${ack.error.message}`);
  await launched;
  console.log(`Launch reaches all ${students} phones: ${(now() - t).toFixed(0)} ms`);

  const answerTimes: number[] = [];
  t = now();
  const acks = await Promise.all(
    phones.map(async (c, i) => {
      const t0 = now();
      const r = await c
        .timeout(15_000)
        .emitWithAck('activity:answer', { activityId: activity.id, round: 1, answer: i % 4 });
      answerTimes.push(now() - t0);
      return r.ok;
    }),
  );
  console.log(
    `Answers, all at once: ${summary(answerTimes)} · total ${(now() - t).toFixed(0)} ms · ${acks.filter(Boolean).length}/${students} ok`,
  );

  // Double taps: every phone answers again → must not create duplicates.
  await Promise.all(
    phones.map((c) =>
      c.timeout(15_000).emitWithAck('activity:answer', { activityId: activity.id, round: 1, answer: 0 }),
    ),
  );
  await new Promise((r) => setTimeout(r, 600)); // let the throttled stats settle
  console.log(`Host live count: ${lastStats}/${students} (from ${statsEvents} throttled stats events)`);

  // 3. Everyone asks a question at once.
  const askTimes: number[] = [];
  t = now();
  await Promise.all(
    phones.map(async (c, i) => {
      const t0 = now();
      await c.timeout(15_000).emitWithAck('question:ask', { text: `Load test question number ${i + 1}?` });
      askTimes.push(now() - t0);
    }),
  );
  console.log(`Questions, all at once: ${summary(askTimes)} · total ${(now() - t).toFixed(0)} ms`);

  // 4. Close + reveal, then check the server's own numbers.
  const revealed = Promise.all(phones.map((c) => new Promise((r) => c.once('activity:student', r))));
  t = now();
  await host.timeout(10_000).emitWithAck('activity:close', { activityId: activity.id, reveal: true });
  await revealed;
  console.log(`Reveal reaches all phones: ${(now() - t).toFixed(0)} ms`);

  const state = await http<HostState>('GET', `/sessions/${session.code}/host`);
  const a = state.activities.find((x) => x.id === activity.id)!;
  const ok =
    state.session.joinedCount === students &&
    a.stats[0]?.count === students &&
    state.questions.length === students;
  console.log(
    `\nServer totals → joined ${state.session.joinedCount}, answers ${a.stats[0]?.count}, questions ${state.questions.length} ` +
      `(expected ${students} each): ${ok ? 'OK — nothing lost, nothing duplicated' : 'MISMATCH'}`,
  );

  phones.forEach((c) => c.close());
  host.close();
  await http('POST', `/sessions/${session.code}/end`);
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

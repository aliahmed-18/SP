import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import request from 'supertest';
import type { ClientToServerEvents, ServerToClientEvents, SocketAuth } from '@getit/shared';
import { createApp } from '../src/app';
import { loginLimiter, registerLimiter } from '../src/auth/routes';
import { prisma } from '../src/db';
import { aiJobFor, waitForAiJob } from '../src/services/ai-job-store';
import { setIo } from '../src/realtime/broadcast';
import { createSocketServer, type IoServer } from '../src/realtime/socket';

export const app = createApp();

/** Wipe every table between tests (test DB only — vitest.config forces TEST_DATABASE_URL). */
export async function resetDb() {
  if (!process.env.DATABASE_URL?.includes('test')) throw new Error('Refusing to wipe a non-test database');
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Response","Activity","MeToo","Question","Topic","Part","Participant","Takeaway","Session","Course","Instructor" CASCADE',
  );
  loginLimiter.reset();
  registerLimiter.reset();
}

let n = 0;
/** Registers a fresh instructor and returns a cookie-carrying supertest agent. */
export async function newInstructor(name = 'Dr. Test') {
  const agent = request.agent(app);
  const email = `t${Date.now()}${n++}@example.com`;
  const res = await agent.post('/api/auth/register').send({ name, email, password: 'password123' });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, me: res.body as { id: string; name: string; email: string }, email };
}

export async function newSession(agent: ReturnType<typeof request.agent>, topic = 'Linear regression') {
  const res = await agent.post('/api/sessions').send({ topic, academicMode: true });
  if (res.status !== 201) throw new Error(`create session failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { id: string; code: string };
}

export const newDeviceId = () => randomUUID();

// ─── Live server for socket tests ───────────────────────────────────────────
export type TestClient = Socket<ServerToClientEvents, ClientToServerEvents>;

export async function startLiveServer() {
  const http: Server = createServer(app);
  const io: IoServer = createSocketServer(http);
  await new Promise<void>((resolve) => http.listen(0, resolve));
  const url = `http://localhost:${(http.address() as AddressInfo).port}`;
  const clients: TestClient[] = [];
  return {
    url,
    connect(auth: SocketAuth): TestClient {
      const c: TestClient = connect(url, {
        auth,
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
      });
      clients.push(c);
      return c;
    },
    async close() {
      clients.forEach((c) => c.close());
      io.removeAllListeners();
      await io.close();
      setIo(null);
    },
  };
}

/** Resolves with the first event payload, or rejects on connect_error / timeout. */
export function nextEvent<E extends keyof ServerToClientEvents>(
  client: TestClient,
  event: E,
  timeoutMs = 3000,
): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).once(event, (payload: any) => {
      clearTimeout(t);
      resolve(payload);
    });
    client.once('connect_error', (err) => {
      clearTimeout(t);
      reject(err);
    });
  });
}

export function connectError(client: TestClient, timeoutMs = 3000): Promise<string> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('expected connect_error')), timeoutMs);
    client.once('connect_error', (err) => {
      clearTimeout(t);
      resolve(err.message);
    });
    client.once('connect', () => {
      clearTimeout(t);
      reject(new Error('connected but expected refusal'));
    });
  });
}

export async function socketToken(agent: ReturnType<typeof request.agent>) {
  const res = await agent.get('/api/auth/socket-token');
  return res.body.token as string;
}

/** Resolves with the first `event` whose payload matches `predicate` (skips stale ones). */
export function eventWhere<E extends keyof ServerToClientEvents>(
  client: TestClient,
  event: E,
  predicate: (payload: Parameters<ServerToClientEvents[E]>[0]) => boolean,
  timeoutMs = 3000,
): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = client as any;
    const t = setTimeout(() => {
      c.off(event, on);
      reject(new Error(`timeout waiting for matching ${event}`));
    }, timeoutMs);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const on = (payload: any) => {
      if (!predicate(payload)) return;
      clearTimeout(t);
      c.off(event, on);
      resolve(payload);
    };
    c.on(event, on);
  });
}

/**
 * POST …/ai/generate (starts a background job), wait for the job, and return what it produced: the AI
 * drafts saved in the activities list, in order, and the final job state.
 */
export async function generate(agent: ReturnType<typeof request.agent>, code: string, body: object) {
  const res = await agent.post(`/api/sessions/${code}/ai/generate`).send(body);
  const s = await prisma.session.findFirst({ where: { code }, orderBy: { startedAt: 'desc' } });
  if (s) await waitForAiJob(s.id);
  const rows = s
    ? await prisma.activity.findMany({
        where: { sessionId: s.id, aiDraft: true },
        orderBy: { position: 'asc' },
      })
    : [];
  const job = s ? aiJobFor(s.id) : null;
  return {
    status: res.status,
    body: res.body as Record<string, unknown>,
    drafts: rows,
    job,
    error: job?.error ?? null,
  };
}

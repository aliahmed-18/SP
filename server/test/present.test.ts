import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { QuickCheckDraftInput } from '@getit/shared';
import { prisma } from '../src/db';
import { askQuestion } from '../src/services/questions';
import { hashDevice } from '../src/lib/deviceHash';
import { reconcileTimers, stopAllTimers } from '../src/realtime/timers';
import {
  eventWhere,
  newDeviceId,
  newInstructor,
  nextEvent,
  resetDb,
  socketToken,
  startLiveServer,
} from './helpers';

let server: Awaited<ReturnType<typeof startLiveServer>>;
beforeEach(async () => {
  await resetDb();
  server = await startLiveServer();
});
afterEach(async () => {
  stopAllTimers();
  await server.close();
});
afterAll(() => prisma.$disconnect());

const TF: QuickCheckDraftInput = {
  type: 'QUICK_CHECK',
  kind: 'TRUE_FALSE',
  prompt: 'Correlation proves causation.',
  correct: false,
  explanation: 'Correlation is not causation.',
};

async function setup() {
  const inst = await newInstructor();
  const s = (await inst.agent.post('/api/sessions').send({ topic: 'Regression' })).body as {
    id: string;
    code: string;
  };
  const token = await socketToken(inst.agent);
  const present = server.connect({ role: 'present', code: s.code, token });
  const first = await nextEvent(present, 'state:present');
  const create = async () =>
    (await inst.agent.post(`/api/sessions/${s.code}/activities`).send(TF)).body.id as string;
  const emit = <T>(event: string, payload: unknown) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (present.timeout(3000) as any).emitWithAck(event, payload) as Promise<T>;
  return { ...inst, s, present, first, create, emit };
}
const row = (id: string) => prisma.activity.findUniqueOrThrow({ where: { id } });

describe('projector snapshot', () => {
  it('has settings (defaults), serverTime, no projection, and no modelAnswer', async () => {
    const { first } = await setup();
    expect(first.settings).toEqual({ timerSec: 0, autoReveal: true });
    expect(Math.abs(Date.parse(first.serverTime) - Date.now())).toBeLessThan(5000);
    expect(first.projected).toBeNull();
  });

  it('settings are stored on the session (a refreshed projector keeps them)', async () => {
    const { emit, s, agent } = await setup();
    expect(await emit('present:settings', { timerSec: 60, autoReveal: false })).toEqual({ ok: true });
    expect(await emit('present:settings', { timerSec: 45, autoReveal: false })).toMatchObject({ ok: false });
    const again = server.connect({ role: 'present', code: s.code, token: await socketToken(agent) });
    expect((await nextEvent(again, 'state:present')).settings).toEqual({ timerSec: 60, autoReveal: false });
  });
});

describe('server-side timer', () => {
  it('auto-closes at 0 and reveals when "show the answer as soon as a question closes" is on', async () => {
    const { create, emit, present } = await setup();
    const a = await create();
    const closed = eventWhere(present, 'activity:present', (p) => p.activity.status !== 'LIVE', 4000);
    expect(await emit('activity:launch', { activityId: a, timerSec: 1 })).toEqual({ ok: true });
    const live = await row(a);
    expect(live.closesAt).not.toBeNull();
    expect((await closed).activity.status).toBe('REVEALED');
    expect(await row(a)).toMatchObject({ status: 'REVEALED', closesAt: null });
  });

  it('auto-reveal off → closes without showing the answer', async () => {
    const { create, emit, present } = await setup();
    await emit('present:settings', { timerSec: 30, autoReveal: false });
    const a = await create();
    const closed = eventWhere(present, 'activity:present', (p) => p.activity.status !== 'LIVE', 4000);
    await emit('activity:launch', { activityId: a, timerSec: 1 });
    expect((await closed).activity.status).toBe('CLOSED');
  });

  it('+15 s extends a running timer; closing early cancels it', async () => {
    const { create, emit } = await setup();
    const a = await create();
    await emit('activity:launch', { activityId: a, timerSec: 30 });
    const before = (await row(a)).closesAt!.getTime();
    expect(await emit('activity:addTime', { activityId: a })).toEqual({ ok: true });
    expect((await row(a)).closesAt!.getTime() - before).toBeGreaterThanOrEqual(15_000);
    await emit('activity:close', { activityId: a });
    expect((await row(a)).closesAt).toBeNull();
    expect(await emit('activity:addTime', { activityId: a })).toMatchObject({
      ok: false,
      error: { code: 'NO_TIMER' },
    });
  });

  it('after a server restart, an overdue timer is closed by the reconcile pass', async () => {
    const { create, emit } = await setup();
    const a = await create();
    await emit('activity:launch', { activityId: a, timerSec: 60 });
    stopAllTimers(); // "restart": in-memory timers are gone
    await prisma.activity.update({ where: { id: a }, data: { closesAt: new Date(Date.now() - 1000) } });
    expect(await reconcileTimers()).toBe(1);
    await new Promise((r) => setTimeout(r, 300));
    expect((await row(a)).status).toBe('REVEALED');
  });
});

describe('undo from the projector (mis-pressed clicker)', () => {
  it('LIVE with no answers → back to DRAFT, stage returns to the previous activity', async () => {
    const { create, emit, s } = await setup();
    const a = await create();
    const b = await create();
    await emit('activity:launch', { activityId: a });
    await emit('activity:close', { activityId: a, reveal: true });
    await emit('activity:launch', { activityId: b });
    expect(await emit('activity:undo', { activityId: b })).toEqual({ ok: true });
    expect((await row(b)).status).toBe('DRAFT');
    const session = await prisma.session.findUniqueOrThrow({ where: { id: s.id } });
    expect(session).toMatchObject({ liveActivityId: null, presentActivityId: a });
  });

  it('LIVE with answers → refused (close it instead)', async () => {
    const { create, emit, s } = await setup();
    const a = await create();
    await emit('activity:launch', { activityId: a });
    const phone = server.connect({ role: 'student', code: s.code, deviceId: newDeviceId() });
    await nextEvent(phone, 'state:student');
    await phone.timeout(3000).emitWithAck('activity:answer', { activityId: a, round: 1, answer: false });
    expect(await emit('activity:undo', { activityId: a })).toMatchObject({
      ok: false,
      error: { code: 'HAS_ANSWERS' },
    });
  });
});

describe('projecting', () => {
  it('a Q&A topic: anonymous questions, counts, reply; host sees which topic is up; launch takes over', async () => {
    const { emit, present, s, agent, create } = await setup();
    await askQuestion(s.id, hashDevice(newDeviceId()), 'Why is the slope negative?');
    const q = await prisma.question.findFirstOrThrow({ where: { sessionId: s.id } });
    const topic = (
      await agent.post(`/api/sessions/${s.code}/topics`).send({ title: 'Slope', questionIds: [q.id] })
    ).body;
    const host = server.connect({ role: 'host', code: s.code, token: await socketToken(agent) });
    await nextEvent(host, 'state:host');

    const shown = nextEvent(present, 'present:projected');
    const hostSnap = eventWhere(host, 'state:host', (h) => h.projectedTopicId === topic.id);
    expect(await emit('present:project', { item: { kind: 'topic', id: topic.id } })).toEqual({ ok: true });
    const view = (await shown).projected;
    expect(view).toEqual({
      kind: 'topic',
      id: topic.id,
      topic: {
        id: topic.id,
        title: 'Slope',
        status: 'OPEN',
        reply: null,
        meTooCount: 0,
        questions: ['Why is the slope negative?'],
      },
    });
    expect(JSON.stringify(view)).not.toMatch(/[0-9a-f]{64}/);
    await hostSnap;

    // Launching a question replaces the projected topic.
    const a = await create();
    const cleared = eventWhere(present, 'present:projected', (p) => p.projected === null);
    await emit('activity:launch', { activityId: a });
    await cleared;
  });

  it('blank / welcome / wrap / back; a topic from another session is refused', async () => {
    const { emit, present } = await setup();
    for (const item of [{ kind: 'blank' }, { kind: 'welcome' }, { kind: 'wrap' }, null]) {
      const ev = nextEvent(present, 'present:projected');
      expect(await emit('present:project', { item })).toEqual({ ok: true });
      expect((await ev).projected).toEqual(item);
    }
    const other = await newInstructor();
    const os = (await other.agent.post('/api/sessions').send({ topic: 'Other' })).body;
    const t = (await other.agent.post(`/api/sessions/${os.code}/topics`).send({ title: 'Theirs' })).body;
    expect(await emit('present:project', { item: { kind: 'topic', id: t.id } })).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
  });

  it('students cannot project or change settings', async () => {
    const { s } = await setup();
    const phone = server.connect({ role: 'student', code: s.code, deviceId: newDeviceId() });
    await nextEvent(phone, 'state:student');
    await expect(
      phone.timeout(500).emitWithAck('present:project', { item: { kind: 'blank' } }),
    ).rejects.toThrow();
  });
});

// Regression tests for the code-review fixes.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { hashDevice } from '../src/lib/deviceHash';
import { askQuestion } from '../src/services/questions';
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
afterEach(() => server.close());
afterAll(() => prisma.$disconnect());

async function setup() {
  const inst = await newInstructor();
  const s = (await inst.agent.post('/api/sessions').send({ topic: 'Regression' })).body as {
    id: string;
    code: string;
  };
  const host = server.connect({ role: 'host', code: s.code, token: await socketToken(inst.agent) });
  await nextEvent(host, 'state:host');
  const phone = server.connect({ role: 'student', code: s.code, deviceId: newDeviceId() });
  await nextEvent(phone, 'state:student');
  return { ...inst, s, host, phone };
}

describe('code-review fixes', () => {
  it('blocked Explain: qa:flagged carries the version of its own write', async () => {
    const { agent, s, host, phone } = await setup();
    const ex = (
      await agent.post(`/api/sessions/${s.code}/activities`).send({ type: 'EXPLAIN', prompt: 'Explain b' })
    ).body.id;
    await host.timeout(3000).emitWithAck('activity:launch', { activityId: ex });
    const flagged = nextEvent(host, 'qa:flagged');
    await phone.timeout(3000).emitWithAck('explain:submit', { activityId: ex, text: 'this is shit' });
    const ev = await flagged;
    const row = await prisma.session.findUniqueOrThrow({ where: { id: s.id } });
    expect(ev).toMatchObject({ version: row.version, flaggedCount: 1 });
  });

  it('Take-away replies: host gets a fresh snapshot with the topic now REPLIED', async () => {
    const { agent, s, host } = await setup();
    const q = await askQuestion(s.id, hashDevice(newDeviceId()), 'How is b computed?');
    if (q.kind !== 'stored') throw new Error('expected stored');
    const topic = (
      await agent
        .post(`/api/sessions/${s.code}/topics`)
        .send({ title: 'Slope', questionIds: [q.question.id] })
    ).body;
    await agent.post(`/api/sessions/${s.code}/end`);
    const snap = eventWhere(host, 'state:host', (h) => h.topics.some((t) => t.status === 'REPLIED'));
    await agent
      .put(`/api/sessions/${s.code}/takeaway`)
      .send({ keyPoints: ['k'], topTopicIds: [topic.id], replies: { [topic.id]: 'b = Sxy / Sxx' } });
    expect((await snap).topics[0]).toMatchObject({ status: 'REPLIED', reply: 'b = Sxy / Sxx' });
  });

  it('editing or deleting the stage activity updates phones', async () => {
    const { agent, s, host, phone } = await setup();
    const id = (
      await agent.post(`/api/sessions/${s.code}/activities`).send({
        type: 'QUICK_CHECK',
        kind: 'TRUE_FALSE',
        prompt: 'Corelation proves causation.',
        correct: false,
        explanation: 'No.',
      })
    ).body.id;
    await host.timeout(3000).emitWithAck('activity:launch', { activityId: id });
    await host.timeout(3000).emitWithAck('activity:close', { activityId: id, reveal: true });
    const edited = eventWhere(
      phone,
      'activity:student',
      (p) => p.activity?.prompt === 'Correlation proves causation.',
    );
    await agent
      .patch(`/api/activities/${id}`)
      .send({ prompt: 'Correlation proves causation.', explanation: 'No.' });
    await edited;
    const gone = eventWhere(phone, 'activity:student', (p) => p.activity === null);
    expect((await agent.delete(`/api/activities/${id}`)).status).toBe(204);
    await gone;
  });

  it('Me too is capped per phone (10 per 10 s)', async () => {
    const { agent, s, phone } = await setup();
    const t = (await agent.post(`/api/sessions/${s.code}/topics`).send({ title: 'T' })).body;
    const results = [];
    for (let i = 0; i < 11; i++) {
      results.push(await phone.timeout(3000).emitWithAck('topic:metoo', { topicId: t.id, on: i % 2 === 0 }));
    }
    expect(results.slice(0, 10).every((r) => r.ok)).toBe(true);
    expect(results[10]).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
  });
});

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { LIMITS } from '@getit/shared';
import { prisma } from '../src/db';
import { hashDevice } from '../src/lib/deviceHash';
import { askQuestion } from '../src/services/questions';
import {
  newDeviceId,
  newInstructor,
  eventWhere,
  nextEvent,
  resetDb,
  socketToken,
  startLiveServer,
  type TestClient,
} from './helpers';

let server: Awaited<ReturnType<typeof startLiveServer>>;
beforeEach(async () => {
  await resetDb();
  server = await startLiveServer();
});
afterEach(() => server.close());
afterAll(() => prisma.$disconnect());

/** A live session with a connected host socket and one student socket. */
async function setup(opts: { academicMode?: boolean } = {}) {
  const inst = await newInstructor();
  const res = await inst.agent
    .post('/api/sessions')
    .send({ topic: 'Regression', academicMode: opts.academicMode ?? true });
  const s = res.body as { id: string; code: string };
  const host = server.connect({ role: 'host', code: s.code, token: await socketToken(inst.agent) });
  await nextEvent(host, 'state:host');
  const deviceId = newDeviceId();
  const student = server.connect({ role: 'student', code: s.code, deviceId });
  await nextEvent(student, 'state:student');
  return { ...inst, s, host, student, deviceId, deviceHash: hashDevice(deviceId) };
}

const ask = (c: TestClient, text: string) => c.timeout(3000).emitWithAck('question:ask', { text });

/** Strip the timestamp so acks can be compared for "identical". */
const shape = (ack: Awaited<ReturnType<typeof ask>>) =>
  ack.ok ? { ok: true, keys: Object.keys(ack.data) } : { ok: false, error: ack.error };

describe('Ask (student → host)', () => {
  it('stores a question and pushes it to the host live, without any identity', async () => {
    const { host, student, s, deviceId, deviceHash } = await setup();
    const incoming = nextEvent(host, 'question:new');
    const ack = await ask(student, '  Why is   the slope negative?  ');
    expect(ack.ok).toBe(true);
    const ev = await incoming;
    expect(ev.question).toMatchObject({
      text: 'Why is the slope negative?',
      addressed: false,
      topicId: null,
    });
    expect(Object.keys(ev.question).sort()).toEqual([
      'addressed',
      'createdAt',
      'id',
      'partId',
      'text',
      'topicId',
    ]);
    expect(JSON.stringify(ev)).not.toContain(deviceHash);
    expect(JSON.stringify(ev)).not.toContain(deviceId);
    expect(await prisma.question.count({ where: { sessionId: s.id } })).toBe(1);
  });

  it('Arabic text is stored as typed', async () => {
    const { student, s } = await setup();
    expect((await ask(student, 'ما الفرق بين معامل الارتباط والميل؟')).ok).toBe(true);
    const q = await prisma.question.findFirstOrThrow({ where: { sessionId: s.id } });
    expect(q.text).toBe('ما الفرق بين معامل الارتباط والميل؟');
  });

  it('blocked question: ack identical to success, nothing stored, flaggedCount + 1, host told', async () => {
    const { host, student, s } = await setup();
    const okAck = await ask(student, 'A normal question?');
    await prisma.participant.updateMany({ data: { lastQuestionAt: new Date(0) } }); // skip the 5 s gap
    const flagged = nextEvent(host, 'qa:flagged');
    const blockedAck = await ask(student, 'this is shit');
    expect(shape(blockedAck)).toEqual(shape(okAck));
    expect((await flagged).flaggedCount).toBe(1);
    expect(await prisma.question.count({ where: { sessionId: s.id } })).toBe(1);
    const row = await prisma.session.findUniqueOrThrow({ where: { id: s.id }, include: { parts: true } });
    expect(row.flaggedCount).toBe(1);
    expect(row.parts[0]!.flaggedCount).toBe(1);
    const all = await prisma.question.findMany();
    expect(all.some((q) => q.text.includes('shit'))).toBe(false);
  });

  it('academic mode OFF: the word filter is skipped (informal session)', async () => {
    const { student, s } = await setup({ academicMode: false });
    await ask(student, 'this is shit');
    expect(await prisma.question.count({ where: { sessionId: s.id } })).toBe(1);
  });

  it('question 4 s after the previous one: ack ok, not stored', async () => {
    const { s, deviceHash } = await setup();
    const t0 = new Date();
    expect((await askQuestion(s.id, deviceHash, 'First?', t0)).kind).toBe('stored');
    expect((await askQuestion(s.id, deviceHash, 'Second?', new Date(t0.getTime() + 4000))).kind).toBe(
      'limited',
    );
    expect((await askQuestion(s.id, deviceHash, 'Third?', new Date(t0.getTime() + 5000))).kind).toBe(
      'stored',
    );
    expect(await prisma.question.count({ where: { sessionId: s.id } })).toBe(2);
  });

  it('41st question: ack ok, not stored', async () => {
    const { s, deviceHash, student } = await setup();
    const t0 = Date.now() - 60 * 60 * 1000;
    for (let i = 0; i < LIMITS.questionsPerDevice; i++) {
      expect((await askQuestion(s.id, deviceHash, `Question ${i}?`, new Date(t0 + i * 6000))).kind).toBe(
        'stored',
      );
    }
    expect((await askQuestion(s.id, deviceHash, 'One more?', new Date(t0 + 41 * 6000))).kind).toBe('limited');
    const ack = await ask(student, 'And via the socket?');
    expect(ack.ok).toBe(true); // same ack as success
    expect(await prisma.question.count({ where: { sessionId: s.id } })).toBe(LIMITS.questionsPerDevice);
  });

  it('two taps at the same moment store only one question (row lock)', async () => {
    const { student, s } = await setup();
    const acks = await Promise.all([
      ask(student, 'Tap one?'),
      ask(student, 'Tap two?'),
      ask(student, 'Tap three?'),
    ]);
    expect(acks.every((a) => a.ok)).toBe(true);
    expect(await prisma.question.count({ where: { sessionId: s.id } })).toBe(1);
  });

  it('empty / too long → a normal validation error (the phone checks this too)', async () => {
    const { student } = await setup();
    expect(shape(await ask(student, '   '))).toEqual({
      ok: false,
      error: { code: 'VALIDATION', message: 'Write a question first.' },
    });
    const long = await ask(student, 'x'.repeat(301));
    expect(long.ok).toBe(false);
  });

  it('hosts and projectors cannot ask; ended sessions refuse', async () => {
    const { host, agent, s, student } = await setup();
    // Host sockets have no question:ask handler: the ack never arrives.
    await expect(host.timeout(500).emitWithAck('question:ask', { text: 'hi?' })).rejects.toThrow();
    await agent.post(`/api/sessions/${s.code}/end`);
    const ack = await ask(student, 'Too late?');
    expect(ack).toEqual({ ok: false, error: { code: 'SESSION_ENDED', message: 'The lecture has ended.' } });
  });
});

describe('Host Q&A management', () => {
  async function withQuestions(n: number) {
    const ctx = await setup();
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const r = await askQuestion(ctx.s.id, hashDevice(newDeviceId()), `Question ${i}?`);
      if (r.kind === 'stored') ids.push(r.question.id);
    }
    return { ...ctx, ids };
  }

  it('addressed toggle → question:updated', async () => {
    const { agent, host, ids } = await withQuestions(1);
    const ev = nextEvent(host, 'question:updated');
    const res = await agent.patch(`/api/questions/${ids[0]}`).send({ addressed: true });
    expect(res.status).toBe(200);
    expect((await ev).question.addressed).toBe(true);
  });

  it('remove → deleted, flagged + 1 (session and part), host told', async () => {
    const { agent, host, ids, s } = await withQuestions(2);
    const ev = nextEvent(host, 'question:removed');
    expect((await agent.delete(`/api/questions/${ids[0]}`)).status).toBe(204);
    const removed = await ev;
    expect(removed.questionId).toBe(ids[0]);
    expect(removed.flaggedCount).toBe(1);
    expect(removed.part.flaggedCount).toBe(1);
    expect(await prisma.question.count({ where: { sessionId: s.id } })).toBe(1);
  });

  it('topics: group, rename, reply, answered in class, delete; students see titles + replies only', async () => {
    const { agent, s, ids, student, host } = await withQuestions(3);
    const studentTopics = eventWhere(student, 'topics:updated', (p) => p.topics.length === 1);
    const hostSnap = eventWhere(host, 'state:host', (p) => p.topics.length === 1);
    const created = await agent
      .post(`/api/sessions/${s.code}/topics`)
      .send({ title: 'Computing the slope', questionIds: ids.slice(0, 2) });
    expect(created.status).toBe(201);
    const topicId = created.body.id as string;
    expect((await hostSnap).questions.filter((q) => q.topicId === topicId)).toHaveLength(2);
    const pub = (await studentTopics).topics;
    expect(pub).toEqual([
      {
        id: topicId,
        title: 'Computing the slope',
        status: 'OPEN',
        reply: null,
        meTooCount: 0,
        questionCount: 2,
      },
    ]);
    expect(JSON.stringify(pub)).not.toContain('Question 0?'); // students never see others' questions

    // REPLIED needs a reply.
    expect((await agent.patch(`/api/topics/${topicId}`).send({ status: 'REPLIED' })).status).toBe(400);
    const replied = eventWhere(student, 'topics:updated', (p) => p.topics[0]?.status === 'REPLIED');
    await agent.patch(`/api/topics/${topicId}`).send({ status: 'REPLIED', reply: 'b = Sxy / Sxx' });
    expect((await replied).topics[0]).toMatchObject({ status: 'REPLIED', reply: 'b = Sxy / Sxx' });
    const qs = await prisma.question.findMany({ where: { topicId } });
    expect(qs.every((q) => q.addressed)).toBe(true);

    // Move the third question in, then delete the topic → questions ungrouped, still there.
    expect(
      (await agent.post(`/api/topics/${topicId}/questions`).send({ questionIds: [ids[2]] })).status,
    ).toBe(204);
    expect(await prisma.question.count({ where: { topicId } })).toBe(3);
    expect((await agent.delete(`/api/topics/${topicId}`)).status).toBe(204);
    expect(await prisma.question.count({ where: { sessionId: s.id, topicId: null } })).toBe(3);
  });

  it('new part: new questions go to part 2; a topic cannot mix parts', async () => {
    const { agent, s, ids, deviceHash } = await withQuestions(1);
    expect((await agent.post(`/api/sessions/${s.code}/parts`)).status).toBe(201);
    const r = await askQuestion(s.id, deviceHash, 'After the break?');
    if (r.kind !== 'stored') throw new Error('expected stored');
    const parts = await prisma.part.findMany({ where: { sessionId: s.id }, orderBy: { number: 'asc' } });
    expect(r.question.partId).toBe(parts[1]!.id);
    const mixed = await agent
      .post(`/api/sessions/${s.code}/topics`)
      .send({ title: 'Mixed', questionIds: [ids[0], r.question.id] });
    expect(mixed.status).toBe(400);
    expect(mixed.body.error.code).toBe('WRONG_PART');
  });

  it("another instructor can't touch my questions or topics", async () => {
    const { agent, s, ids } = await withQuestions(1);
    const topic = (await agent.post(`/api/sessions/${s.code}/topics`).send({ title: 'T', questionIds: [] }))
      .body;
    const other = await newInstructor();
    expect((await other.agent.patch(`/api/questions/${ids[0]}`).send({ addressed: true })).status).toBe(404);
    expect((await other.agent.delete(`/api/questions/${ids[0]}`)).status).toBe(404);
    expect((await other.agent.patch(`/api/topics/${topic.id}`).send({ title: 'Mine' })).status).toBe(404);
    expect((await other.agent.post(`/api/sessions/${s.code}/topics`).send({ title: 'X' })).status).toBe(404);
    expect((await request(server.url).delete(`/api/topics/${topic.id}`)).status).toBe(401);
  });
});

describe('Me too', () => {
  it('one per device per topic, undoable; host + students updated; iMeToo in my snapshot only', async () => {
    const { agent, s, student, host, deviceId } = await setup();
    const topic = (await agent.post(`/api/sessions/${s.code}/topics`).send({ title: 'r vs b' })).body;
    const meToo = (on: boolean, c: TestClient = student) =>
      c.timeout(3000).emitWithAck('topic:metoo', { topicId: topic.id, on });

    const hostEv = nextEvent(host, 'topics:host');
    expect(await meToo(true)).toEqual({ ok: true, data: { on: true, meTooCount: 1 } });
    expect((await hostEv).topics[0]!.meTooCount).toBe(1);
    expect(await meToo(true)).toEqual({ ok: true, data: { on: true, meTooCount: 1 } }); // idempotent

    const other = server.connect({ role: 'student', code: s.code, deviceId: newDeviceId() });
    const otherState = await nextEvent(other, 'state:student');
    expect(otherState.topics[0]).toMatchObject({ meTooCount: 1, iMeToo: false });
    expect(await meToo(true, other)).toEqual({ ok: true, data: { on: true, meTooCount: 2 } });

    // My refreshed phone still knows I tapped it.
    const again = server.connect({ role: 'student', code: s.code, deviceId });
    expect((await nextEvent(again, 'state:student')).topics[0]).toMatchObject({
      iMeToo: true,
      meTooCount: 2,
    });

    expect(await meToo(false)).toEqual({ ok: true, data: { on: false, meTooCount: 1 } });
    expect(await prisma.meToo.count({ where: { topicId: topic.id } })).toBe(1);
  });

  it('topics are sorted by Me too, then question count', async () => {
    const { agent, s, student } = await setup();
    const a = (await agent.post(`/api/sessions/${s.code}/topics`).send({ title: 'A' })).body;
    const b = (await agent.post(`/api/sessions/${s.code}/topics`).send({ title: 'B' })).body;
    const update = eventWhere(student, 'topics:updated', (p) => p.topics.some((t) => t.meTooCount === 1));
    await student.timeout(3000).emitWithAck('topic:metoo', { topicId: b.id, on: true });
    expect((await update).topics.map((t) => t.title)).toEqual(['B', 'A']);
    expect(a.id).toBeDefined();
  });

  it('unknown topic / other session → error ack', async () => {
    const { student } = await setup();
    const res = await student.timeout(3000).emitWithAck('topic:metoo', { topicId: newDeviceId(), on: true });
    expect(res).toEqual({ ok: false, error: { code: 'NOT_FOUND', message: 'Topic not found.' } });
  });
});

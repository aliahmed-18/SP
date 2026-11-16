import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { QuickCheckDraftInput } from '@getit/shared';
import { prisma } from '../src/db';
import {
  app,
  eventWhere,
  newDeviceId,
  newInstructor,
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

const MCQ: QuickCheckDraftInput = {
  type: 'QUICK_CHECK',
  kind: 'MCQ',
  prompt: 'Which value of r shows the strongest linear relationship?',
  options: ['r = 0.45', 'r = −0.92', 'r = 0.80', 'r = 0'],
  correct: 1,
  explanation: 'Strength is the size of r, ignoring the sign.',
};
const TF: QuickCheckDraftInput = {
  type: 'QUICK_CHECK',
  kind: 'TRUE_FALSE',
  prompt: 'Correlation proves causation.',
  correct: false,
  explanation: 'Correlation is not causation.',
};
const NUM: QuickCheckDraftInput = {
  type: 'QUICK_CHECK',
  kind: 'NUMERIC',
  prompt: 'ŷ = 327.04 − 14.2x at x = 20?',
  correct: 43.04,
  tolerance: 0.1,
  explanation: '327.04 − 284 = 43.04',
};

async function setup() {
  const inst = await newInstructor();
  const s = (await inst.agent.post('/api/sessions').send({ topic: 'Regression' })).body as {
    id: string;
    code: string;
  };
  const host = server.connect({ role: 'host', code: s.code, token: await socketToken(inst.agent) });
  await nextEvent(host, 'state:host');
  const create = async (draft: QuickCheckDraftInput) => {
    const res = await inst.agent.post(`/api/sessions/${s.code}/activities`).send(draft);
    if (res.status !== 201) throw new Error(JSON.stringify(res.body));
    return res.body.id as string;
  };
  const act = (
    event: 'activity:launch' | 'activity:reveal' | 'activity:newRound' | 'activity:undo',
    activityId: string,
  ) => host.timeout(3000).emitWithAck(event, { activityId });
  const close = (activityId: string, reveal = false) =>
    host.timeout(3000).emitWithAck('activity:close', { activityId, reveal });
  const student = async (deviceId = newDeviceId()) => {
    const c = server.connect({ role: 'student', code: s.code, deviceId });
    const state = await nextEvent(c, 'state:student');
    return { c, state, deviceId };
  };
  return { ...inst, s, host, create, act, close, student };
}

const answer = (c: TestClient, activityId: string, ans: number | boolean, round = 1) =>
  c.timeout(3000).emitWithAck('activity:answer', { activityId, round, answer: ans });

describe('drafts (REST)', () => {
  it('validates with the shared schema', async () => {
    const { agent, s } = await setup();
    const bad = async (body: object) =>
      (await agent.post(`/api/sessions/${s.code}/activities`).send(body)).status;
    expect(await bad({ ...MCQ, options: ['only one'] })).toBe(400);
    expect(await bad({ ...MCQ, correct: 4 })).toBe(400);
    expect(await bad({ ...MCQ, options: ['a', 'b', 'c', 'd', 'e', 'f'] })).toBe(400);
    expect(await bad({ ...MCQ, explanation: '' })).toBe(400);
    expect(await bad({ ...NUM, tolerance: -1 })).toBe(400);
    expect(await bad({ ...TF, correct: 'no' })).toBe(400);
    expect(await bad({ ...MCQ, prompt: 'x'.repeat(2001) })).toBe(400);
    expect(await bad(MCQ)).toBe(201);
  });

  it('edit, reorder, delete; owner-only', async () => {
    const { agent, s, create } = await setup();
    const a = await create(MCQ);
    const b = await create(TF);
    expect((await agent.patch(`/api/activities/${a}`).send({ ...MCQ, prompt: 'Edited?' })).body.prompt).toBe(
      'Edited?',
    );
    expect(
      (await agent.post(`/api/sessions/${s.code}/activities/reorder`).send({ ids: [b, a] })).status,
    ).toBe(204);
    const order = await prisma.activity.findMany({
      where: { sessionId: s.id },
      orderBy: { position: 'asc' },
    });
    expect(order.map((x) => x.id)).toEqual([b, a]);
    expect((await agent.post(`/api/sessions/${s.code}/activities/reorder`).send({ ids: [b] })).status).toBe(
      400,
    );

    const other = await newInstructor();
    expect((await other.agent.patch(`/api/activities/${a}`).send(MCQ)).status).toBe(404);
    expect((await other.agent.delete(`/api/activities/${a}`)).status).toBe(404);
    expect((await request(app).delete(`/api/activities/${a}`)).status).toBe(401);
    expect((await agent.delete(`/api/activities/${a}`)).status).toBe(204);
  });

  it('after launch: not deletable while LIVE, only wording can change once run', async () => {
    const { agent, create, act, close } = await setup();
    const a = await create(MCQ);
    await act('activity:launch', a);
    expect((await agent.delete(`/api/activities/${a}`)).status).toBe(409);
    expect((await agent.patch(`/api/activities/${a}`).send({ prompt: 'x', explanation: 'y' })).status).toBe(
      409,
    );
    await close(a);
    const fix = await agent
      .patch(`/api/activities/${a}`)
      .send({ prompt: 'Fixed typo?', explanation: 'Better wording.' });
    expect(fix.status).toBe(200);
    expect(fix.body.correct).toBe(1);
    const more = await agent
      .patch(`/api/activities/${a}`)
      .send({ prompt: 'x', explanation: 'y', options: ['a', 'b'] });
    expect(more.status).toBe(409);
  });

  it("copies activities from my earlier session (templates), not from someone else's", async () => {
    const { agent, s, create } = await setup();
    await create(MCQ);
    await create(NUM);
    const next = (await agent.post('/api/sessions').send({ topic: 'Next week' })).body;
    const res = await agent.post(`/api/sessions/${next.code}/activities/copy`).send({ fromSessionId: s.id });
    expect(res.body).toEqual({ copied: 2 });
    const copies = await prisma.activity.findMany({
      where: { sessionId: next.id },
      orderBy: { position: 'asc' },
    });
    expect(copies.map((c) => [c.kind, c.status, c.round])).toEqual([
      ['MCQ', 'DRAFT', 1],
      ['NUMERIC', 'DRAFT', 1],
    ]);
    const other = await newInstructor();
    const theirs = (await other.agent.post('/api/sessions').send({ topic: 'Theirs' })).body;
    expect(
      (await other.agent.post(`/api/sessions/${theirs.code}/activities/copy`).send({ fromSessionId: s.id }))
        .status,
    ).toBe(404);
  });
});

describe('lifecycle + one live activity', () => {
  it('launching a 2nd activity while one is LIVE fails with the exact message', async () => {
    const { create, act } = await setup();
    const a = await create(MCQ);
    const b = await create(TF);
    expect((await act('activity:launch', a)).ok).toBe(true);
    expect(await act('activity:launch', b)).toEqual({
      ok: false,
      error: { code: 'ONE_LIVE', message: 'One activity can be live at a time.' },
    });
  });

  it('two launches at the same moment: exactly one wins', async () => {
    const { create, act, s } = await setup();
    const ids = await Promise.all([create(MCQ), create(TF), create(NUM)]);
    const results = await Promise.all(ids.map((id) => act('activity:launch', id)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await prisma.activity.count({ where: { sessionId: s.id, status: 'LIVE' } })).toBe(1);
  });

  it('DRAFT → LIVE → CLOSED → REVEALED, new round only before reveal, undo steps back', async () => {
    const { create, act, close, s } = await setup();
    const a = await create(MCQ);
    const status = async () => prisma.activity.findUniqueOrThrow({ where: { id: a } });
    expect((await act('activity:reveal', a)).ok).toBe(false); // draft
    await act('activity:launch', a);
    expect((await prisma.session.findUniqueOrThrow({ where: { id: s.id } })).liveActivityId).toBe(a);
    await close(a);
    expect((await status()).status).toBe('CLOSED');
    expect((await prisma.session.findUniqueOrThrow({ where: { id: s.id } })).liveActivityId).toBeNull();
    expect((await act('activity:newRound', a)).ok).toBe(true);
    expect(await status()).toMatchObject({ status: 'LIVE', round: 2 });
    await close(a, true);
    expect((await status()).status).toBe('REVEALED');
    expect((await act('activity:newRound', a)).ok).toBe(false);
    expect((await act('activity:undo', a)).ok).toBe(true);
    expect((await status()).status).toBe('CLOSED');
    expect((await act('activity:undo', a)).ok).toBe(true);
    expect((await status()).status).toBe('LIVE');
    expect((await act('activity:undo', a)).ok).toBe(false);
  });

  it('students cannot drive the lifecycle', async () => {
    const { create, student } = await setup();
    const a = await create(MCQ);
    const { c } = await student();
    await expect(c.timeout(500).emitWithAck('activity:launch', { activityId: a })).rejects.toThrow();
    expect((await prisma.activity.findUniqueOrThrow({ where: { id: a } })).status).toBe('DRAFT');
  });
});

describe('answers', () => {
  it('same device answering twice in a round → one stored response, ack returns the first answer', async () => {
    const { create, act, student } = await setup();
    const a = await create(MCQ);
    await act('activity:launch', a);
    const { c } = await student();
    expect(await answer(c, a, 2)).toEqual({ ok: true, data: { round: 1, answer: 2, confident: null } });
    expect(await answer(c, a, 1)).toEqual({ ok: true, data: { round: 1, answer: 2, confident: null } });
    expect(await prisma.response.count({ where: { activityId: a } })).toBe(1);
  });

  it('simultaneous double tap → still one response', async () => {
    const { create, act, student } = await setup();
    const a = await create(TF);
    await act('activity:launch', a);
    const { c } = await student();
    const acks = await Promise.all([answer(c, a, true), answer(c, a, false), answer(c, a, true)]);
    expect(acks.every((x) => x.ok)).toBe(true);
    expect(await prisma.response.count({ where: { activityId: a } })).toBe(1);
  });

  it('answers are checked: wrong type, out-of-range option, closed, wrong round', async () => {
    const { create, act, close, student } = await setup();
    const a = await create(MCQ);
    const { c } = await student();
    expect((await answer(c, a, 0)).ok).toBe(false); // still a draft
    await act('activity:launch', a);
    expect(await answer(c, a, 7)).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(await answer(c, a, true)).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(await answer(c, a, 0, 2)).toMatchObject({ ok: false, error: { code: 'ANSWERING_CLOSED' } });
    await close(a);
    expect(await answer(c, a, 0)).toMatchObject({ ok: false, error: { code: 'ANSWERING_CLOSED' } });
  });

  it('round 2: everyone may answer again; round 1 answers are kept', async () => {
    const { create, act, close, student } = await setup();
    const a = await create(MCQ);
    await act('activity:launch', a);
    const { c } = await student();
    await answer(c, a, 0);
    await close(a);
    await act('activity:newRound', a);
    expect(await answer(c, a, 1, 2)).toEqual({ ok: true, data: { round: 2, answer: 1, confident: null } });
    const rows = await prisma.response.findMany({ where: { activityId: a }, orderBy: { round: 'asc' } });
    expect(rows.map((r) => [r.round, r.answer])).toEqual([
      [1, 0],
      [2, 1],
    ]);
  });

  it('confidence: Sure / Not sure / Skip on my own answer, not after reveal', async () => {
    const { create, act, close, student } = await setup();
    const a = await create(NUM);
    await act('activity:launch', a);
    const { c } = await student();
    const conf = (confident: boolean | null) =>
      c.timeout(3000).emitWithAck('activity:confidence', { activityId: a, round: 1, confident });
    expect((await conf(true)).ok).toBe(false); // no answer yet
    await answer(c, a, 43.04);
    expect(await conf(true)).toEqual({ ok: true, data: { round: 1, answer: 43.04, confident: true } });
    expect(await conf(null)).toEqual({ ok: true, data: { round: 1, answer: 43.04, confident: null } });
    await close(a, true);
    expect((await conf(false)).ok).toBe(false);
  });

  it('a refreshed phone gets its answer back in the snapshot (shows "Answer sent")', async () => {
    const { create, act, student } = await setup();
    const a = await create(MCQ);
    await act('activity:launch', a);
    const { c, deviceId } = await student();
    await answer(c, a, 3);
    c.close();
    const again = await student(deviceId);
    expect(again.state.liveActivity).toMatchObject({ id: a, status: 'LIVE', round: 1 });
    expect(again.state.myResponse).toEqual({ round: 1, answer: 3, confident: null });
    const fresh = await student();
    expect(fresh.state.myResponse).toBeNull();
  });
});

describe('what each screen receives', () => {
  it('phones get the activity without the answer until REVEALED, then with it', async () => {
    const { create, act, close, student } = await setup();
    const a = await create(MCQ);
    const { c } = await student();
    const live = nextEvent(c, 'activity:student');
    await act('activity:launch', a);
    const liveDto = (await live).activity!;
    expect(liveDto).toMatchObject({ id: a, status: 'LIVE', options: MCQ.kind === 'MCQ' ? MCQ.options : [] });
    expect(liveDto).not.toHaveProperty('correct');
    expect(JSON.stringify(liveDto)).not.toContain('ignoring the sign');

    const closed = nextEvent(c, 'activity:student');
    await close(a);
    expect((await closed).activity).not.toHaveProperty('correct');

    const revealed = nextEvent(c, 'activity:student');
    await act('activity:reveal', a);
    expect((await revealed).activity).toMatchObject({
      status: 'REVEALED',
      correct: 1,
      explanation: MCQ.explanation,
    });
  });

  it('host: versioned activity:host with per-round stats (% correct, sure and wrong, distribution)', async () => {
    const { create, act, close, host, student } = await setup();
    const a = await create(MCQ);
    await act('activity:launch', a);
    const phones = await Promise.all([student(), student(), student(), student()]);
    const picks = [1, 1, 0, 2];
    for (const [i, p] of phones.entries()) {
      await answer(p.c, a, picks[i]!);
      await p.c
        .timeout(3000)
        .emitWithAck('activity:confidence', { activityId: a, round: 1, confident: true });
    }
    const updated = eventWhere(host, 'activity:host', (p) => p.activity.status === 'CLOSED');
    await close(a);
    const { activity, version } = await updated;
    expect(version).toBeGreaterThan(0);
    expect(activity.stats).toEqual([
      {
        round: 1,
        count: 4,
        percentCorrect: 50,
        sureWrong: 2,
        distribution: [
          { answer: 0, count: 1, correct: false },
          { answer: 1, count: 2, correct: true },
          { answer: 2, count: 1, correct: false },
          { answer: 3, count: 0, correct: false },
        ],
      },
    ]);
    expect(JSON.stringify(activity)).not.toMatch(/[0-9a-f]{64}/); // no device hashes
  });

  it('live counts are throttled: a burst of 30 answers → a handful of activity:stats, last one exact', async () => {
    const { create, act, host, student } = await setup();
    const a = await create(TF);
    await act('activity:launch', a);
    const phones = await Promise.all(Array.from({ length: 30 }, () => student()));
    const seen: number[] = [];
    host.on('activity:stats', (p) => seen.push(p.responses));
    await Promise.all(phones.map((p, i) => answer(p.c, a, i % 2 === 0)));
    await new Promise((r) => setTimeout(r, 700));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.length).toBeLessThanOrEqual(6);
    expect(seen[seen.length - 1]).toBe(30);
  });

  it('ending the session closes the live activity and phones leave it', async () => {
    const { create, act, agent, s, student } = await setup();
    const a = await create(MCQ);
    await act('activity:launch', a);
    const { c } = await student();
    const snap = eventWhere(c, 'state:student', (p) => p.session.status === 'ENDED');
    await agent.post(`/api/sessions/${s.code}/end`);
    expect((await snap).liveActivity).toBeNull();
    expect((await prisma.activity.findUniqueOrThrow({ where: { id: a } })).status).toBe('CLOSED');
  });
});

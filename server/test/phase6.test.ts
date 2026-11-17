import ExcelJS from 'exceljs';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TAKEAWAY_VISIBLE_MS } from '@getit/shared';
import { prisma } from '../src/db';
import { hashDevice } from '../src/lib/deviceHash';
import { askQuestion } from '../src/services/questions';
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

async function setup(academicMode = true) {
  const inst = await newInstructor();
  const s = (await inst.agent.post('/api/sessions').send({ topic: 'Regression', academicMode })).body as {
    id: string;
    code: string;
  };
  const token = await socketToken(inst.agent);
  const host = server.connect({ role: 'host', code: s.code, token });
  await nextEvent(host, 'state:host');
  const present = server.connect({ role: 'present', code: s.code, token });
  await nextEvent(present, 'state:present');
  const explain = async () =>
    (
      await inst.agent.post(`/api/sessions/${s.code}/activities`).send({
        type: 'EXPLAIN',
        prompt: 'What does b tell you that r does not?',
        modelAnswer: 'SECRET model answer',
      })
    ).body.id as string;
  const cmd = (event: 'activity:launch' | 'activity:close', activityId: string) =>
    host.timeout(3000).emitWithAck(event, { activityId });
  const phone = async (deviceId = newDeviceId()) => {
    const c = server.connect({ role: 'student', code: s.code, deviceId });
    return { c, state: await nextEvent(c, 'state:student'), deviceId };
  };
  return { ...inst, s, host, present, explain, cmd, phone };
}

const submit = (c: TestClient, activityId: string, text: string) =>
  c.timeout(3000).emitWithAck('explain:submit', { activityId, text });

describe('Explain', () => {
  it('create + launch: phones get the prompt, never the model answer', async () => {
    const { explain, cmd, phone } = await setup();
    const id = await explain();
    const p = await phone();
    const live = nextEvent(p.c, 'activity:student');
    expect(await cmd('activity:launch', id)).toEqual({ ok: true, data: undefined });
    const dto = (await live).activity!;
    expect(dto).toMatchObject({
      type: 'EXPLAIN',
      prompt: 'What does b tell you that r does not?',
      status: 'LIVE',
    });
    expect(JSON.stringify(dto)).not.toContain('SECRET');
  });

  it('one answer per device; stored / blocked / duplicate all get the same ack; blocked text never stored', async () => {
    const { explain, cmd, phone, host } = await setup();
    const id = await explain();
    await cmd('activity:launch', id);
    const a = await phone();
    const b = await phone();
    const okAck = await submit(a.c, id, 'b is the change in y per unit of x.');
    const flagged = nextEvent(host, 'qa:flagged');
    const blockedAck = await submit(b.c, id, 'this is shit');
    const dupAck = await submit(a.c, id, 'a second answer');
    const expected = { ok: true, data: { round: 1, answer: null, confident: null } };
    expect([okAck, blockedAck, dupAck]).toEqual([expected, expected, expected]);
    expect((await flagged).flaggedCount).toBe(1);
    const rows = await prisma.response.findMany({ where: { activityId: id }, orderBy: { createdAt: 'asc' } });
    expect(rows.map((r) => r.text)).toEqual(['b is the change in y per unit of x.', null]);
    expect(JSON.stringify(rows)).not.toContain('shit');
  });

  it('a refreshed phone still shows "Answer sent" (myResponse), even for a blocked answer', async () => {
    const { explain, cmd, phone } = await setup();
    const id = await explain();
    await cmd('activity:launch', id);
    const b = await phone();
    await submit(b.c, id, 'this is shit');
    b.c.close();
    const again = await phone(b.deviceId);
    expect(again.state.myResponse).toEqual({ round: 1, answer: null, confident: null });
  });

  it('≤ 200 characters; empty refused; closed refused', async () => {
    const { explain, cmd, phone } = await setup();
    const id = await explain();
    await cmd('activity:launch', id);
    const p = await phone();
    expect(await submit(p.c, id, 'x'.repeat(201))).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
    expect(await submit(p.c, id, '   ')).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    await cmd('activity:close', id);
    expect(await submit(p.c, id, 'late')).toMatchObject({ ok: false, error: { code: 'ANSWERING_CLOSED' } });
  });

  it('host sees answer texts only after closing; projector never; tags are owner-only', async () => {
    const { explain, cmd, phone, host, present, agent } = await setup();
    const id = await explain();
    await cmd('activity:launch', id);
    const p = await phone();
    await submit(p.c, id, 'A bigger b means a stronger correlation.');
    const hostClosed = eventWhere(host, 'activity:host', (e) => e.activity.status === 'CLOSED');
    const presentClosed = eventWhere(present, 'activity:present', (e) => e.activity.status === 'CLOSED');
    await cmd('activity:close', id);
    const h = (await hostClosed).activity;
    expect(h.responseCount).toBe(1);
    expect(h.explainAnswers).toEqual([
      { id: expect.any(String), text: 'A bigger b means a stronger correlation.', tag: null },
    ]);
    const pr = (await presentClosed).activity;
    expect(pr).not.toHaveProperty('explainAnswers');
    expect(JSON.stringify(pr)).not.toContain('bigger b');
    expect(JSON.stringify(pr)).not.toContain('SECRET');

    const answerId = h.explainAnswers[0]!.id;
    const other = await newInstructor();
    expect(
      (await other.agent.patch(`/api/responses/${answerId}/tag`).send({ tag: 'MISCONCEPTION' })).status,
    ).toBe(404);
    expect((await agent.patch(`/api/responses/${answerId}/tag`).send({ tag: 'WRONG' })).status).toBe(400);
    expect((await agent.patch(`/api/responses/${answerId}/tag`).send({ tag: 'MISCONCEPTION' })).status).toBe(
      204,
    );
    expect((await prisma.response.findUniqueOrThrow({ where: { id: answerId } })).tag).toBe('MISCONCEPTION');
  });

  it('a misconception goes on the projector anonymously (only once tagged)', async () => {
    const { explain, cmd, phone, host, present, agent } = await setup();
    const id = await explain();
    await cmd('activity:launch', id);
    const p = await phone();
    await submit(p.c, id, 'b shows how strong the relationship is.');
    await cmd('activity:close', id);
    const answerId = (await prisma.response.findFirstOrThrow({ where: { activityId: id } })).id;
    const project = () =>
      host.timeout(3000).emitWithAck('present:project', { item: { kind: 'misconception', id: answerId } });
    expect(await project()).toMatchObject({ ok: false, error: { code: 'NOT_MISCONCEPTION' } });
    await agent.patch(`/api/responses/${answerId}/tag`).send({ tag: 'MISCONCEPTION' });
    const shown = nextEvent(present, 'present:projected');
    expect(await project()).toEqual({ ok: true, data: undefined });
    const view = (await shown).projected;
    expect(view).toEqual({
      kind: 'misconception',
      id: answerId,
      prompt: 'What does b tell you that r does not?',
      text: 'b shows how strong the relationship is.',
    });
    expect(JSON.stringify(view)).not.toMatch(/[0-9a-f]{64}/);
  });
});

describe('Take-away', () => {
  async function ended() {
    const ctx = await setup();
    const { s, agent } = ctx;
    for (const [i, title] of ['Least squares', 'Computing the slope'].entries()) {
      const r = await askQuestion(s.id, hashDevice(newDeviceId()), `Question ${i}?`);
      if (r.kind !== 'stored') throw new Error('expected stored');
      await agent.post(`/api/sessions/${s.code}/topics`).send({ title, questionIds: [r.question.id] });
    }
    // "Computing the slope" gets the most Me too → first in the draft.
    const slope = await prisma.topic.findFirstOrThrow({
      where: { sessionId: s.id, title: 'Computing the slope' },
    });
    await prisma.topic.update({ where: { id: slope.id }, data: { meTooCount: 9 } });
    const phone = await ctx.phone();
    await agent.post(`/api/sessions/${s.code}/end`);
    return { ...ctx, phone, slopeId: slope.id };
  }

  it('the editor needs an ended session; draft lists topics by Me too and pre-selects them', async () => {
    const { s, agent, slopeId } = await ended();
    const draft = (await agent.get(`/api/sessions/${s.code}/takeaway/draft`)).body;
    expect(draft.status).toBe('DRAFT');
    expect(draft.topics.map((t: { title: string }) => t.title)).toEqual([
      'Computing the slope',
      'Least squares',
    ]);
    expect(draft.topTopicIds[0]).toBe(slopeId);
    const live = await newInstructor();
    const ls = (await live.agent.post('/api/sessions').send({ topic: 'Live' })).body;
    expect((await live.agent.get(`/api/sessions/${ls.code}/takeaway/draft`)).status).toBe(409);
  });

  it('save → publish → phones are told; students get it; replies filled in become REPLIED', async () => {
    const { s, agent, slopeId, phone } = await ended();
    expect((await request(app).get(`/api/public/sessions/${s.code}/takeaway`)).status).toBe(404);
    const save = await agent.put(`/api/sessions/${s.code}/takeaway`).send({
      keyPoints: ['The least-squares line minimises squared errors.', 'Correlation is not causation.'],
      topTopicIds: [slopeId],
      replies: { [slopeId]: 'b = Sxy / Sxx' },
    });
    expect(save.status).toBe(200);
    expect(await prisma.topic.findUniqueOrThrow({ where: { id: slopeId } })).toMatchObject({
      status: 'REPLIED',
      reply: 'b = Sxy / Sxx',
    });
    expect((await request(app).get(`/api/public/sessions/${s.code}/takeaway`)).status).toBe(404); // still a draft

    const told = new Promise<void>((resolve) => phone.c.once('takeaway:published', () => resolve()));
    expect((await agent.post(`/api/sessions/${s.code}/takeaway/publish`)).status).toBe(200);
    await told;
    const pub = await request(app).get(`/api/public/sessions/${s.code}/takeaway`);
    expect(pub.status).toBe(200);
    expect(pub.body).toMatchObject({
      sessionId: s.id,
      topic: 'Regression',
      keyPoints: ['The least-squares line minimises squared errors.', 'Correlation is not causation.'],
      topics: [{ title: 'Computing the slope', meTooCount: 9, status: 'REPLIED', reply: 'b = Sxy / Sxx' }],
    });
    expect(Date.parse(pub.body.expiresAt) - Date.parse(pub.body.endedAt)).toBe(TAKEAWAY_VISIBLE_MS);
    expect(JSON.stringify(pub.body)).not.toContain('Question 0?'); // no student questions
    const snap = await phone.c.timeout(3000).emitWithAck('state:request');
    expect(snap.ok).toBe(true);
  });

  it('cannot publish an empty Take-away; other instructors and other topics are refused', async () => {
    const { s, agent } = await ended();
    expect((await agent.post(`/api/sessions/${s.code}/takeaway/publish`)).status).toBe(409);
    expect(
      (
        await agent
          .put(`/api/sessions/${s.code}/takeaway`)
          .send({ keyPoints: ['x'.repeat(301)], topTopicIds: [] })
      ).status,
    ).toBe(400);
    expect(
      (
        await agent
          .put(`/api/sessions/${s.code}/takeaway`)
          .send({ keyPoints: [], topTopicIds: [newDeviceId()] })
      ).status,
    ).toBe(404);
    const other = await newInstructor();
    expect((await other.agent.get(`/api/sessions/${s.code}/takeaway/draft`)).status).toBe(404);
  });

  it('gone for students 24 h after the end', async () => {
    const { s, agent } = await ended();
    await agent.put(`/api/sessions/${s.code}/takeaway`).send({ keyPoints: ['One point'], topTopicIds: [] });
    await agent.post(`/api/sessions/${s.code}/takeaway/publish`);
    await prisma.session.update({
      where: { id: s.id },
      data: { endedAt: new Date(Date.now() - TAKEAWAY_VISIBLE_MS - 1000) },
    });
    expect((await request(app).get(`/api/public/sessions/${s.code}/takeaway`)).status).toBe(404);
    // The instructor keeps it.
    expect((await agent.get(`/api/sessions/${s.code}/takeaway/draft`)).body.keyPoints).toEqual(['One point']);
  });
});

describe('Excel export', () => {
  it('owner only; sheets with questions, topics, quick checks, explain; no device hashes', async () => {
    const { s, agent, explain, cmd, phone } = await setup();
    const r = await askQuestion(s.id, hashDevice(newDeviceId()), '=HYPERLINK("http://evil")');
    if (r.kind !== 'stored') throw new Error('expected stored');
    await agent
      .post(`/api/sessions/${s.code}/topics`)
      .send({ title: 'Formulas', questionIds: [r.question.id] });
    const qc = (
      await agent.post(`/api/sessions/${s.code}/activities`).send({
        type: 'QUICK_CHECK',
        kind: 'TRUE_FALSE',
        prompt: 'Correlation proves causation.',
        correct: false,
        explanation: 'No.',
      })
    ).body.id as string;
    await cmd('activity:launch', qc);
    const p = await phone();
    await p.c.timeout(3000).emitWithAck('activity:answer', { activityId: qc, round: 1, answer: false });
    await cmd('activity:close', qc);
    const ex = await explain();
    await cmd('activity:launch', ex);
    await submit(p.c, ex, 'b has units.');
    await cmd('activity:close', ex);

    const other = await newInstructor();
    expect((await other.agent.get(`/api/sessions/${s.id}/export.xlsx`)).status).toBe(404);
    const res = await agent
      .get(`/api/sessions/${s.id}/export.xlsx`)
      .buffer(true)
      .parse((resp, cb) => {
        const chunks: Buffer[] = [];
        resp.on('data', (c: Buffer) => chunks.push(c));
        resp.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(
      /attachment; filename="getit-regression-\d{4}-\d{2}-\d{2}\.xlsx"/,
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as never); // exceljs types predate Node 22's generic Buffer
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Questions', 'Topics', 'Quick Checks', 'Explain']);
    const cell = wb.getWorksheet('Questions')!.getRow(2).getCell(3);
    expect(cell.value).toBe('=HYPERLINK("http://evil")'); // stored as text…
    expect(cell.type).toBe(ExcelJS.ValueType.String); // …never as a formula
    expect(wb.getWorksheet('Topics')!.getRow(2).getCell(1).value).toBe('Formulas');
    expect(wb.getWorksheet('Quick Checks')!.getRow(2).values).toEqual(
      expect.arrayContaining(['Correlation proves causation.', 'True / False', 'False', 1, 1, 1, 0]),
    );
    expect(wb.getWorksheet('Explain')!.getRow(2).getCell(2).value).toBe('b has units.');
    const all = wb.worksheets
      .flatMap((w) => w.getSheetValues())
      .flat(3)
      .join('|');
    expect(all).not.toMatch(/[0-9a-f]{64}/);
  });
});

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { CODE_REGEX, SESSION_MAX_LIVE_MS } from '@getit/shared';
import request from 'supertest';
import { prisma } from '../src/db';
import { createSession } from '../src/services/sessions';
import { app, newDeviceId, newInstructor, newSession, resetDb } from './helpers';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe('courses', () => {
  it('create / list / rename / delete, scoped to the owner', async () => {
    const a = await newInstructor();
    const b = await newInstructor();
    const created = await a.agent.post('/api/courses').send({ name: 'ITCS 444 — Mobile Development' });
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    expect((await a.agent.get('/api/courses')).body).toEqual([
      expect.objectContaining({ id, name: 'ITCS 444 — Mobile Development', sessionCount: 0 }),
    ]);
    expect((await b.agent.get('/api/courses')).body).toEqual([]);
    expect((await b.agent.patch(`/api/courses/${id}`).send({ name: 'Mine now' })).status).toBe(404);
    expect((await b.agent.delete(`/api/courses/${id}`)).status).toBe(404);

    expect((await a.agent.patch(`/api/courses/${id}`).send({ name: '  ' })).status).toBe(400);
    expect((await a.agent.patch(`/api/courses/${id}`).send({ name: 'Renamed' })).status).toBe(204);
    expect((await a.agent.get('/api/courses')).body[0].name).toBe('Renamed');
  });

  it('deleting a course keeps its sessions (courseId → null)', async () => {
    const { agent } = await newInstructor();
    const course = (await agent.post('/api/courses').send({ name: 'C' })).body;
    const s = (
      await agent.post('/api/sessions').send({ topic: 'T', academicMode: true, courseId: course.id })
    ).body;
    expect((await agent.get(`/api/courses/${course.id}/sessions`)).body).toHaveLength(1);
    expect((await agent.delete(`/api/courses/${course.id}`)).status).toBe(204);
    const orphans = (await agent.get('/api/sessions?courseId=none')).body;
    expect(orphans.map((x: { id: string }) => x.id)).toEqual([s.id]);
  });
});

describe('sessions', () => {
  it('creates a LIVE session with a valid code and Part 1', async () => {
    const { agent } = await newInstructor();
    const s = await newSession(agent);
    expect(s.code).toMatch(CODE_REGEX);
    const row = await prisma.session.findUniqueOrThrow({ where: { id: s.id }, include: { parts: true } });
    expect(row.status).toBe('LIVE');
    expect(row.academicMode).toBe(true);
    expect(row.parts.map((p) => p.number)).toEqual([1]);
  });

  it("rejects another instructor's course and bad topics", async () => {
    const a = await newInstructor();
    const b = await newInstructor();
    const course = (await a.agent.post('/api/courses').send({ name: 'C' })).body;
    expect((await b.agent.post('/api/sessions').send({ topic: 'T', courseId: course.id })).status).toBe(404);
    expect((await a.agent.post('/api/sessions').send({ topic: '' })).status).toBe(400);
    expect((await a.agent.post('/api/sessions').send({ topic: 'x'.repeat(81) })).status).toBe(400);
  });

  it('retries on a code collision among LIVE sessions (partial unique index)', async () => {
    const { me } = await newInstructor();
    const codes = ['AAAAA', 'AAAAA', 'BBBBB'];
    const first = await createSession(me.id, { topic: 'One', academicMode: true }, () => codes.shift()!);
    const second = await createSession(me.id, { topic: 'Two', academicMode: true }, () => codes.shift()!);
    expect(first.code).toBe('AAAAA');
    expect(second.code).toBe('BBBBB');
  });

  it("an ENDED session's code can be reused", async () => {
    const { agent, me } = await newInstructor();
    const first = await createSession(me.id, { topic: 'Old', academicMode: true }, () => 'CCCCC');
    expect((await agent.post(`/api/sessions/${first.code}/end`)).status).toBe(200);
    const second = await createSession(me.id, { topic: 'New', academicMode: true }, () => 'CCCCC');
    expect(second.code).toBe('CCCCC');
    // Host and students now resolve the code to the LIVE one.
    expect((await agent.get('/api/sessions/CCCCC/host')).body.session.topic).toBe('New');
    expect((await request(app).get('/api/public/sessions/CCCCC')).body.topic).toBe('New');
  });

  it('host snapshot is owner-only', async () => {
    const a = await newInstructor();
    const b = await newInstructor();
    const s = await newSession(a.agent);
    const own = await a.agent.get(`/api/sessions/${s.code}/host`);
    expect(own.status).toBe(200);
    expect(own.body).toMatchObject({ version: 0, session: { code: s.code, status: 'LIVE', joinedCount: 0 } });
    expect((await b.agent.get(`/api/sessions/${s.code}/host`)).status).toBe(404);
    expect((await b.agent.post(`/api/sessions/${s.code}/end`)).status).toBe(404);
  });

  it('end session: ENDED + endedAt + Take-away draft; idempotent', async () => {
    const { agent } = await newInstructor();
    const s = await newSession(agent);
    const res = await agent.post(`/api/sessions/${s.code}/end`);
    expect(res.status).toBe(200);
    expect(res.body.session.status).toBe('ENDED');
    expect(res.body.session.endedAt).toEqual(expect.any(String));
    expect(res.body.version).toBe(1);
    const t = await prisma.takeaway.findUniqueOrThrow({ where: { sessionId: s.id } });
    expect(t.status).toBe('DRAFT');
    const again = await agent.post(`/api/sessions/${s.code}/end`);
    expect(again.status).toBe(200);
    expect(again.body.version).toBe(1);
  });

  it('a session older than 6 h is ended on access', async () => {
    const { agent } = await newInstructor();
    const s = await newSession(agent);
    await prisma.session.update({
      where: { id: s.id },
      data: { startedAt: new Date(Date.now() - SESSION_MAX_LIVE_MS - 1000) },
    });
    const host = await agent.get(`/api/sessions/${s.code}/host`);
    expect(host.body.session.status).toBe('ENDED');
    const list = await agent.get('/api/sessions');
    expect(list.body[0].status).toBe('ENDED');
  });

  it('dashboard list shows joined + question counts', async () => {
    const { agent } = await newInstructor();
    const s = await newSession(agent);
    for (let i = 0; i < 3; i++) {
      await request(app).post(`/api/public/sessions/${s.code}/join`).set('x-device-id', newDeviceId());
    }
    const list = (await agent.get('/api/sessions')).body;
    expect(list[0]).toMatchObject({ id: s.id, code: s.code, joined: 3, questions: 0, status: 'LIVE' });
  });
});

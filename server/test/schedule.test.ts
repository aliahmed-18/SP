// Calendar: plan a lecture, prepare it, start it at its time (auto) or by hand; phones wait; .ics export.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HostState, PublicSessionInfo, SessionListItem } from '@getit/shared';
import { prisma } from '../src/db';
import { lectureIcs } from '../src/lib/ics';
import { launchActivity } from '../src/services/activities';
import { createSession, startDueSessions } from '../src/services/sessions';
import {
  connectError,
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

const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

async function plan(agent: Awaited<ReturnType<typeof newInstructor>>['agent'], body: object = {}) {
  const res = await agent
    .post('/api/sessions')
    .send({ topic: 'Regression', scheduledFor: inMinutes(60), durationMin: 75, ...body });
  expect(res.status).toBe(201);
  return res.body as { id: string; code: string };
}

describe('scheduled lectures', () => {
  it('plan → listed as SCHEDULED with its time; code reserved; prepare activities but not launch', async () => {
    const { agent } = await newInstructor();
    const s = await plan(agent);
    const list = (await agent.get('/api/sessions')).body as SessionListItem[];
    expect(list[0]).toMatchObject({ code: s.code, status: 'SCHEDULED', durationMin: 75, autoStart: true });
    expect(Date.parse(list[0]!.scheduledFor!)).toBeGreaterThan(Date.now());

    const host = (await agent.get(`/api/sessions/${s.code}/host`)).body as HostState;
    expect(host.session).toMatchObject({ status: 'SCHEDULED', autoStart: true, durationMin: 75 });

    const a = await agent
      .post(`/api/sessions/${s.code}/activities`)
      .send({ type: 'EXPLAIN', prompt: 'What does b mean?' });
    expect(a.status).toBe(201); // prepare ahead
    await expect(launchActivity(s.id, a.body.id as string)).rejects.toMatchObject({ status: 409 });
  });

  it('times in the past or more than a year ahead are refused', async () => {
    const { agent } = await newInstructor();
    for (const scheduledFor of [inMinutes(-10), inMinutes(60 * 24 * 400)])
      expect((await agent.post('/api/sessions').send({ topic: 'X', scheduledFor })).status).toBe(400);
  });

  it("a planned lecture's code can't be taken by another lecture before it ends", async () => {
    const { agent, me } = await newInstructor();
    const s = await plan(agent);
    const codes = [s.code, 'ABCDE'];
    const other = await createSession(me.id, { topic: 'Other', academicMode: true }, () => codes.shift()!);
    expect(other.code).toBe('ABCDE'); // the reserved code was skipped
  });

  it('phones that open the code early see the start time; they can only join once it is LIVE', async () => {
    const { agent } = await newInstructor();
    const s = await plan(agent);
    const info = (await agent.get(`/api/public/sessions/${s.code}`)).body as PublicSessionInfo;
    expect(info).toMatchObject({ status: 'SCHEDULED', topic: 'Regression' });
    expect(info.scheduledFor).toBeTruthy();
    const deviceId = newDeviceId();
    const join = await agent.post(`/api/public/sessions/${s.code}/join`).set('x-device-id', deviceId);
    expect(join.status).toBe(404);
    expect(await connectError(server.connect({ role: 'student', code: s.code, deviceId }))).toBe(
      'SESSION_NOT_FOUND',
    );
  });

  it('Start now: LIVE at once, the open host page is told, phones can join', async () => {
    const { agent } = await newInstructor();
    const s = await plan(agent);
    const host = server.connect({ role: 'host', code: s.code, token: await socketToken(agent) });
    const first = (await nextEvent(host, 'state:host')) as HostState;
    expect(first.session.status).toBe('SCHEDULED');

    const live = eventWhere(host, 'state:host', (st: HostState) => st.session.status === 'LIVE');
    const res = await agent.post(`/api/sessions/${s.code}/start`);
    expect((res.body as HostState).session.status).toBe('LIVE');
    await live;
    const row = await prisma.session.findUniqueOrThrow({ where: { id: s.id } });
    expect(Date.now() - row.startedAt.getTime()).toBeLessThan(10_000); // the 6 h limit counts from now
    expect(row.scheduledFor).not.toBeNull(); // the plan is kept for the record

    const deviceId = newDeviceId();
    expect(
      (await agent.post(`/api/public/sessions/${s.code}/join`).set('x-device-id', deviceId)).status,
    ).toBe(200);
    // Starting twice is harmless.
    expect((await agent.post(`/api/sessions/${s.code}/start`)).status).toBe(200);
  });

  it('auto-start: due lectures with auto-start go LIVE; auto-start off waits for the instructor', async () => {
    const { agent } = await newInstructor();
    const auto = await plan(agent);
    const manual = await plan(agent, { autoStart: false });
    expect(await startDueSessions(new Date(Date.now() + 30 * 60_000))).toBe(0); // not yet
    expect(await startDueSessions(new Date(Date.now() + 61 * 60_000))).toBe(1);
    const rows = await prisma.session.findMany({ where: { id: { in: [auto.id, manual.id] } } });
    expect(rows.find((r) => r.id === auto.id)!.status).toBe('LIVE');
    expect(rows.find((r) => r.id === manual.id)!.status).toBe('SCHEDULED');
  });

  it('edit and cancel before the start; not after', async () => {
    const { agent } = await newInstructor();
    const s = await plan(agent);
    const at = inMinutes(180);
    const edited = await agent
      .patch(`/api/sessions/${s.code}/schedule`)
      .send({ topic: 'Correlation', scheduledFor: at, durationMin: 90, autoStart: false });
    expect(edited.status).toBe(200);
    expect((edited.body as HostState).session).toMatchObject({
      topic: 'Correlation',
      durationMin: 90,
      autoStart: false,
    });
    expect(Date.parse((edited.body as HostState).session.scheduledFor!)).toBe(Date.parse(at));

    const other = await newInstructor('Dr. Other');
    expect((await other.agent.delete(`/api/sessions/${s.code}`)).status).toBe(404);
    expect((await agent.delete(`/api/sessions/${s.code}`)).status).toBe(204);
    expect(await prisma.session.count({ where: { id: s.id } })).toBe(0);

    const live = (await agent.post('/api/sessions').send({ topic: 'Now' })).body as { code: string };
    expect((await agent.delete(`/api/sessions/${live.code}`)).status).toBe(409);
    expect((await agent.patch(`/api/sessions/${live.code}/schedule`).send({ topic: 'x' })).status).toBe(409);
  });

  it('"Add to calendar" downloads an .ics event with the join link and a reminder', async () => {
    const { agent } = await newInstructor();
    const s = await plan(agent);
    const res = await agent.get(`/api/sessions/${s.id}/calendar.ics`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/calendar/);
    expect(res.text).toContain('BEGIN:VEVENT');
    expect(res.text).toContain(`Join code: ${s.code}`);
    expect(res.text).toContain('TRIGGER:-PT15M');
  });
});

describe('lectureIcs (pure)', () => {
  it('UTC times, end = start + length, escaped text, folded long lines', () => {
    const ics = lectureIcs({
      id: 'abc',
      topic: 'Regression; slope, and r',
      code: 'BCEU3',
      start: new Date('2026-12-01T08:00:00Z'),
      durationMin: 90,
      baseUrl: 'https://getit.example',
      now: new Date('2026-11-20T10:00:00Z'),
    });
    expect(ics).toContain('DTSTART:20261201T080000Z');
    expect(ics).toContain('DTEND:20261201T093000Z');
    expect(ics).toContain('SUMMARY:Getit lecture: Regression\\; slope\\, and r');
    expect(ics.split('\r\n').every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});

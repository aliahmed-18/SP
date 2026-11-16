import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { TAKEAWAY_VISIBLE_MS } from '@getit/shared';
import { prisma } from '../src/db';
import { hashDevice } from '../src/lib/deviceHash';
import { app, newDeviceId, newInstructor, newSession, resetDb } from './helpers';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe('student join (public, anonymous)', () => {
  it('GET /public/sessions/:code → topic + status, or the exact 404 message', async () => {
    const { agent } = await newInstructor();
    const s = await newSession(agent, 'Linear regression and correlation');
    const ok = await request(app).get(`/api/public/sessions/${s.code.toLowerCase()}`);
    expect(ok.body).toEqual({ topic: 'Linear regression and correlation', status: 'LIVE' });
    const missing = await request(app).get('/api/public/sessions/ZZZZZ');
    expect(missing.status).toBe(404);
    expect(missing.body.error.message).toBe("That session doesn't exist or has expired.");
    expect((await request(app).get('/api/public/sessions/O0O0O')).status).toBe(400);
  });

  it('join registers one Participant per device (idempotent) and stores only the hash', async () => {
    const { agent } = await newInstructor();
    const s = await newSession(agent);
    const deviceId = newDeviceId();
    const r1 = await request(app).post(`/api/public/sessions/${s.code}/join`).set('x-device-id', deviceId);
    const r2 = await request(app).post(`/api/public/sessions/${s.code}/join`).set('x-device-id', deviceId);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r1.body).toMatchObject({
      session: { id: s.id, status: 'LIVE' },
      myQuestions: [],
      liveActivity: null,
    });

    const rows = await prisma.participant.findMany({ where: { sessionId: s.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.deviceHash).toBe(hashDevice(deviceId));
    expect(rows[0]!.deviceHash).not.toContain(deviceId);

    // Anonymity: neither the student nor the host payload contains the device id or its hash.
    const host = await agent.get(`/api/sessions/${s.code}/host`);
    for (const body of [JSON.stringify(r1.body), JSON.stringify(host.body)]) {
      expect(body).not.toContain(deviceId);
      expect(body).not.toContain(rows[0]!.deviceHash);
    }
    expect(host.body.session.joinedCount).toBe(1);
  });

  it('requires a uuid x-device-id', async () => {
    const { agent } = await newInstructor();
    const s = await newSession(agent);
    const res = await request(app).post(`/api/public/sessions/${s.code}/join`).set('x-device-id', 'nope');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DEVICE_ID_REQUIRED');
  });

  it('ENDED session: visible (status ENDED) for 24 h without registering; then 404', async () => {
    const { agent } = await newInstructor();
    const s = await newSession(agent);
    await agent.post(`/api/sessions/${s.code}/end`);
    const join = await request(app)
      .post(`/api/public/sessions/${s.code}/join`)
      .set('x-device-id', newDeviceId());
    expect(join.body.session.status).toBe('ENDED');
    expect(await prisma.participant.count({ where: { sessionId: s.id } })).toBe(0);

    await prisma.session.update({
      where: { id: s.id },
      data: { endedAt: new Date(Date.now() - TAKEAWAY_VISIBLE_MS - 1000) },
    });
    expect((await request(app).get(`/api/public/sessions/${s.code}`)).status).toBe(404);
  });
});

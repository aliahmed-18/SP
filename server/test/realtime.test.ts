import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SESSION_MAX_LIVE_MS } from '@getit/shared';
import { prisma } from '../src/db';
import { endExpiredSessions } from '../src/services/sessions';
import {
  connectError,
  newDeviceId,
  newInstructor,
  newSession,
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

describe('socket auth + rooms', () => {
  it('student with a wrong code is rejected', async () => {
    const c = server.connect({ role: 'student', code: 'ZZZZZ', deviceId: newDeviceId() });
    expect(await connectError(c)).toBe('SESSION_NOT_FOUND');
  });

  it('malformed handshake is rejected', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = server.connect({ role: 'student', code: 'BCEU3', deviceId: 'not-a-uuid' } as any);
    expect(await connectError(c)).toBe('INVALID_AUTH');
  });

  it("host socket with another instructor's token is rejected; no/garbage token too", async () => {
    const a = await newInstructor();
    const b = await newInstructor();
    const s = await newSession(a.agent);
    const tokenB = await socketToken(b.agent);
    expect(await connectError(server.connect({ role: 'host', code: s.code, token: tokenB }))).toBe(
      'FORBIDDEN',
    );
    expect(await connectError(server.connect({ role: 'present', code: s.code, token: tokenB }))).toBe(
      'FORBIDDEN',
    );
    expect(await connectError(server.connect({ role: 'host', code: s.code, token: 'garbage' }))).toBe(
      'FORBIDDEN',
    );
  });

  it('every connect gets a snapshot; state:request sends another', async () => {
    const { agent } = await newInstructor();
    const s = await newSession(agent, 'Snapshots');
    const host = server.connect({ role: 'host', code: s.code, token: await socketToken(agent) });
    const hs = await nextEvent(host, 'state:host');
    expect(hs.session).toMatchObject({ code: s.code, topic: 'Snapshots', joinedCount: 0 });

    const student = server.connect({ role: 'student', code: s.code, deviceId: newDeviceId() });
    const ss = await nextEvent(student, 'state:student');
    expect(ss).toMatchObject({ session: { id: s.id, topic: 'Snapshots', status: 'LIVE' } });

    const again = nextEvent(student, 'state:student');
    const ack = await student.timeout(3000).emitWithAck('state:request');
    expect(ack.ok).toBe(true);
    expect((await again).session.id).toBe(s.id);
  });

  it('joined count updates live on host + projector; a refreshed phone is not counted twice', async () => {
    const { agent } = await newInstructor();
    const s = await newSession(agent);
    const token = await socketToken(agent);
    const host = server.connect({ role: 'host', code: s.code, token });
    const present = server.connect({ role: 'present', code: s.code, token });
    await Promise.all([nextEvent(host, 'state:host'), nextEvent(present, 'state:present')]);

    const phone1 = newDeviceId();
    let joined = Promise.all([nextEvent(host, 'session:joined'), nextEvent(present, 'session:joined')]);
    const p1 = server.connect({ role: 'student', code: s.code, deviceId: phone1 });
    expect(await joined).toEqual([{ joinedCount: 1 }, { joinedCount: 1 }]);

    joined = Promise.all([nextEvent(host, 'session:joined'), nextEvent(present, 'session:joined')]);
    server.connect({ role: 'student', code: s.code, deviceId: newDeviceId() });
    expect(await joined).toEqual([{ joinedCount: 2 }, { joinedCount: 2 }]);

    // Phone 1 "refreshes": same device id, new socket → no new join event, count stays 2.
    p1.close();
    let extra = false;
    host.once('session:joined', () => (extra = true));
    const p1b = server.connect({ role: 'student', code: s.code, deviceId: phone1 });
    await nextEvent(p1b, 'state:student');
    await new Promise((r) => setTimeout(r, 200));
    expect(extra).toBe(false);
    expect(await prisma.participant.count({ where: { sessionId: s.id } })).toBe(2);
  });

  it('student payloads never contain the device hash', async () => {
    const { agent } = await newInstructor();
    const s = await newSession(agent);
    const deviceId = newDeviceId();
    const student = server.connect({ role: 'student', code: s.code, deviceId });
    const state = await nextEvent(student, 'state:student');
    const hash = (await prisma.participant.findFirstOrThrow({ where: { sessionId: s.id } })).deviceHash;
    expect(JSON.stringify(state)).not.toContain(hash);
    expect(JSON.stringify(state)).not.toContain(deviceId);
  });

  it('ending a session (or the 6 h sweep) notifies everyone with session:ended + fresh snapshots', async () => {
    const { agent } = await newInstructor();
    const s = await newSession(agent);
    const host = server.connect({ role: 'host', code: s.code, token: await socketToken(agent) });
    const student = server.connect({ role: 'student', code: s.code, deviceId: newDeviceId() });
    await Promise.all([nextEvent(host, 'state:host'), nextEvent(student, 'state:student')]);

    const endedHost = nextEvent(host, 'session:ended');
    const endedStudent = nextEvent(student, 'session:ended');
    const snapshot = nextEvent(student, 'state:student');
    await prisma.session.update({
      where: { id: s.id },
      data: { startedAt: new Date(Date.now() - SESSION_MAX_LIVE_MS - 1) },
    });
    expect(await endExpiredSessions()).toBe(1);
    expect((await endedHost).endedAt).toEqual(expect.any(String));
    await endedStudent;
    expect((await snapshot).session.status).toBe('ENDED');
  });
});

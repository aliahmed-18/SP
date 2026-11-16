import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { newDeviceId, newInstructor, newSession, nextEvent, resetDb, startLiveServer } from './helpers';

let server: Awaited<ReturnType<typeof startLiveServer>>;
beforeEach(async () => {
  await resetDb();
  server = await startLiveServer();
});
afterEach(() => server.close());
afterAll(() => prisma.$disconnect());

describe('socket.io', () => {
  it('answers system:ping with an ack (authenticated socket)', async () => {
    const { agent } = await newInstructor();
    const s = await newSession(agent);
    const client = server.connect({ role: 'student', code: s.code, deviceId: newDeviceId() });
    await nextEvent(client, 'state:student');
    const res = await client.timeout(3000).emitWithAck('system:ping');
    expect(res.ok).toBe(true);
    if (res.ok) expect(Date.parse(res.data.serverTime)).not.toBeNaN();
  });
});

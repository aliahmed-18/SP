// Explain answers up to EXPLAIN_MAX (1000): long answers are stored, not silently blocked.
import { afterAll, afterEach, beforeEach, expect, it } from 'vitest';
import { EXPLAIN_MAX } from '@getit/shared';
import { prisma } from '../src/db';
import { newDeviceId, newInstructor, nextEvent, resetDb, socketToken, startLiveServer } from './helpers';

let server: Awaited<ReturnType<typeof startLiveServer>>;
beforeEach(async () => {
  await resetDb();
  server = await startLiveServer();
});
afterEach(() => server.close());
afterAll(() => prisma.$disconnect());

it('a 700-character answer is stored (academic mode on); over the limit is a plain error', async () => {
  const { agent } = await newInstructor();
  const s = (await agent.post('/api/sessions').send({ topic: 'Regression', academicMode: true })).body as {
    id: string;
    code: string;
  };
  const ex = (
    await agent.post(`/api/sessions/${s.code}/activities`).send({ type: 'EXPLAIN', prompt: 'Explain b' })
  ).body.id as string;
  const host = server.connect({ role: 'host', code: s.code, token: await socketToken(agent) });
  await nextEvent(host, 'state:host');
  await host.timeout(3000).emitWithAck('activity:launch', { activityId: ex });

  const phone = server.connect({ role: 'student', code: s.code, deviceId: newDeviceId() });
  await nextEvent(phone, 'state:student');
  const long = 'The slope b is the change in y for each one-unit increase in x, measured in units of y. '
    .repeat(8)
    .trim();
  expect(long.length).toBeGreaterThan(600);
  const ok = await phone.timeout(3000).emitWithAck('explain:submit', { activityId: ex, text: long });
  expect(ok.ok).toBe(true);
  const row = await prisma.response.findFirstOrThrow({ where: { activityId: ex } });
  expect(row.text).toBe(long);
  expect((await prisma.session.findUniqueOrThrow({ where: { id: s.id } })).flaggedCount).toBe(0);

  const other = server.connect({ role: 'student', code: s.code, deviceId: newDeviceId() });
  await nextEvent(other, 'state:student');
  const tooLong = await other
    .timeout(3000)
    .emitWithAck('explain:submit', { activityId: ex, text: 'x'.repeat(EXPLAIN_MAX + 1) });
  expect(tooLong).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
});

import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/db';

const app = createApp();
afterAll(() => prisma.$disconnect());

describe('REST basics', () => {
  it('GET /api/health reports ok + db', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, db: true });
  });

  it('unknown /api route returns the standard error shape', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found.' } });
  });

  it('bad JSON returns a 400 with the standard error shape', async () => {
    const res = await request(app).post('/api/health').set('content-type', 'application/json').send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_JSON');
  });
});

describe('database constraints from the first migration', () => {
  it('has the two partial unique indexes', async () => {
    const rows = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE indexname IN ('session_open_code_unique', 'activity_one_live_per_session')`;
    expect(rows.map((r) => r.indexname).sort()).toEqual([
      'activity_one_live_per_session',
      'session_open_code_unique', // a code is unique among LIVE and SCHEDULED sessions
    ]);
  });
});

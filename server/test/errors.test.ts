import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../src/lib/errors';

/** Runs the error middleware on `err` and returns what the client would get. */
function handle(err: unknown) {
  let status = 0;
  let body: unknown;
  const res = {
    status(s: number) {
      status = s;
      return this;
    },
    json(b: unknown) {
      body = b;
    },
  };
  errorHandler(err, {} as never, res as never, () => {});
  return { status, body: body as { error: { code: string; message: string } } };
}

const known = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('db', { code, clientVersion: Prisma.prismaVersion.client });

describe('database problems get a clear message, not "Something went wrong"', () => {
  it('database off / connection dropped → DB_UNREACHABLE with the fix', () => {
    for (const code of ['P1001', 'P1017']) {
      const r = handle(known(code));
      expect(r.status).toBe(503);
      expect(r.body.error.code).toBe('DB_UNREACHABLE');
      expect(r.body.error.message).toMatch(/Docker Desktop/);
    }
  });

  it('tables missing → DB_NOT_MIGRATED with the fix', () => {
    const r = handle(known('P2021'));
    expect(r.body.error).toMatchObject({ code: 'DB_NOT_MIGRATED' });
    expect(r.body.error.message).toMatch(/npm run db:migrate/);
  });

  it('other errors stay generic', () => {
    expect(handle(new Error('boom')).body.error.code).toBe('INTERNAL');
  });
});

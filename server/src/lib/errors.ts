import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { isProd } from '../env';

/** Throw this from routes/services; the error middleware turns it into `{ error: { code, message } }`. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFoundApi: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found.' } });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof ZodError) {
    res
      .status(400)
      .json({ error: { code: 'VALIDATION', message: err.issues[0]?.message ?? 'Invalid input.' } });
    return;
  }
  // express.json() parse errors
  if (typeof err === 'object' && err && 'type' in err && err.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'BAD_JSON', message: 'Invalid JSON body.' } });
    return;
  }
  const db = databaseProblem(err);
  if (db) {
    console.error(`[getit] Database problem: ${db.hint}`);
    res.status(503).json({ error: { code: db.code, message: isProd ? DB_DOWN_PROD : db.hint } });
    return;
  }
  console.error('[getit] Unhandled error', err);

  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } });
};

const DB_DOWN_PROD = 'The service is temporarily unavailable. Please try again in a moment.';

/**
 * The database is off or not set up: say so (in development, with the fix) instead of a generic
 * "Something went wrong" — the most common setup mistake is Docker Desktop not running.
 */
function databaseProblem(err: unknown): { code: string; hint: string } | null {
  const code =
    err instanceof Prisma.PrismaClientKnownRequestError
      ? err.code
      : err instanceof Prisma.PrismaClientInitializationError
        ? err.errorCode
        : undefined;
  if (
    err instanceof Prisma.PrismaClientInitializationError ||
    ['P1000', 'P1001', 'P1002', 'P1017'].includes(code ?? '')
  )
    return {
      code: 'DB_UNREACHABLE',
      hint: "Can't reach the database. Start Docker Desktop, then run `docker compose up -d`.",
    };
  if (code === 'P2021' || code === 'P2022')
    return {
      code: 'DB_NOT_MIGRATED',
      hint: 'The database tables are missing or out of date. Run `npm run db:migrate`.',
    };
  return null;
}

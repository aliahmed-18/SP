import type { RequestHandler, Response } from 'express';
import { HttpError } from '../lib/errors';
import { AUTH_COOKIE, verifyToken } from './jwt';

/** Rejects with 401 unless a valid instructor session cookie is present. */
export const requireInstructor: RequestHandler = (req, res, next) => {
  const id = verifyToken(req.cookies?.[AUTH_COOKIE] as string | undefined, 'session');
  if (!id) throw new HttpError(401, 'UNAUTHENTICATED', 'Please log in.');
  res.locals.instructorId = id;
  next();
};

export function instructorId(res: Response): string {
  const id = res.locals.instructorId as string | undefined;
  if (!id) throw new HttpError(401, 'UNAUTHENTICATED', 'Please log in.');
  return id;
}

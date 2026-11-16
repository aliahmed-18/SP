import type { CookieOptions } from 'express';
import jwt from 'jsonwebtoken';
import { env, isProd } from '../env';

export const AUTH_COOKIE = 'getit_token';
const SESSION_TTL_S = 7 * 24 * 60 * 60; // 7 days
const SOCKET_TTL_S = 15 * 60; // docs/03: short-lived socket token

type TokenType = 'session' | 'socket';
type Payload = { sub: string; typ: TokenType };

function sign(instructorId: string, typ: TokenType, expiresIn: number) {
  return jwt.sign({ typ } satisfies Omit<Payload, 'sub'>, env.JWT_SECRET, {
    algorithm: 'HS256',
    subject: instructorId,
    expiresIn,
  });
}

export const signSessionToken = (instructorId: string) => sign(instructorId, 'session', SESSION_TTL_S);
export const signSocketToken = (instructorId: string) => sign(instructorId, 'socket', SOCKET_TTL_S);

/** Returns the instructor id, or null if the token is missing/invalid/expired/of the wrong type. */
export function verifyToken(token: string | undefined, typ: TokenType): string | null {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    if (typeof decoded !== 'object' || decoded.typ !== typ || typeof decoded.sub !== 'string') return null;
    return decoded.sub;
  } catch {
    return null;
  }
}

export const authCookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: isProd,
  path: '/',
  maxAge: SESSION_TTL_S * 1000,
};

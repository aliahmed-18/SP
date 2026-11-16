import { Router } from 'express';
import { loginSchema, registerSchema, type SocketTokenResponse } from '@getit/shared';
import { HttpError } from '../lib/errors';
import { FixedWindowLimiter } from '../lib/rateLimit';
import { parse } from '../lib/validate';
import { getMe, login, register } from '../services/auth';
import { AUTH_COOKIE, authCookieOptions, signSessionToken, signSocketToken } from './jwt';
import { instructorId, requireInstructor } from './middleware';

export const loginLimiter = new FixedWindowLimiter(20, 10 * 60 * 1000); // per IP + email
export const registerLimiter = new FixedWindowLimiter(50, 60 * 60 * 1000); // per IP

const TOO_MANY = new HttpError(429, 'RATE_LIMITED', 'Too many attempts. Wait a few minutes and try again.');

export const authRouter = Router();

authRouter.post('/auth/register', async (req, res) => {
  if (!registerLimiter.hit(req.ip ?? 'unknown')) throw TOO_MANY;
  const me = await register(parse(registerSchema, req.body));
  res.cookie(AUTH_COOKIE, signSessionToken(me.id), authCookieOptions);
  res.status(201).json(me);
});

authRouter.post('/auth/login', async (req, res) => {
  const input = parse(loginSchema, req.body);
  if (!loginLimiter.hit(`${req.ip ?? 'unknown'}|${input.email}`)) throw TOO_MANY;
  const me = await login(input);
  res.cookie(AUTH_COOKIE, signSessionToken(me.id), authCookieOptions);
  res.json(me);
});

authRouter.post('/auth/logout', (_req, res) => {
  const { maxAge: _maxAge, ...clear } = authCookieOptions;
  res.clearCookie(AUTH_COOKIE, clear);
  res.status(204).end();
});

authRouter.get('/auth/me', requireInstructor, async (_req, res) => {
  res.json(await getMe(instructorId(res)));
});

authRouter.get('/auth/socket-token', requireInstructor, (_req, res) => {
  const body: SocketTokenResponse = { token: signSocketToken(instructorId(res)) };
  res.json(body);
});

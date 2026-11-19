import { Router, type Response } from 'express';
import {
  aiGenerateSchema,
  codeParamSchema,
  idParamSchema,
  type AiGenerateLine,
  type AiStatus,
} from '@getit/shared';
import { instructorId, requireInstructor } from '../auth/middleware';
import { HttpError } from '../lib/errors';
import { FixedWindowLimiter } from '../lib/rateLimit';
import { parse } from '../lib/validate';
import { aiEnabled, streamDrafts, sortExplainAnswers, suggestKeyPoints, suggestTopics } from '../services/ai';
import { ownedActivity } from '../services/qa-access';
import { getHostSession } from '../services/sessions';

// Optional AI helpers (docs/03 §AI). Instructor only; they return proposals and change nothing.
export const aiRouter = Router();

/** Protects the (free-tier) AI quota: 20 requests per instructor per 10 minutes. */
export const aiLimiter = new FixedWindowLimiter(20, 10 * 60 * 1000);

/** AI configured + within this instructor's allowance (counted only for valid, owned requests). */
function assertReady(res: Response) {
  if (!aiEnabled()) throw new HttpError(503, 'AI_OFF', "AI isn't set up on this server.");
  if (!aiLimiter.hit(instructorId(res)))
    throw new HttpError(429, 'RATE_LIMITED', 'Too many AI requests. Try again in a few minutes.');
}

aiRouter.get('/ai/status', requireInstructor, (_req, res) => {
  res.json({ enabled: aiEnabled() } satisfies AiStatus);
});

aiRouter.post('/sessions/:code/ai/group', requireInstructor, async (req, res) => {
  const { code } = parse(codeParamSchema, req.params);
  const s = await getHostSession(instructorId(res), code);
  assertReady(res);
  res.json(await suggestTopics(s.id));
});

aiRouter.post('/sessions/:code/ai/generate', requireInstructor, async (req, res) => {
  const { code } = parse(codeParamSchema, req.params);
  const input = parse(aiGenerateSchema, req.body);
  await getHostSession(instructorId(res), code); // owner only
  assertReady(res);
  // Errors above are normal JSON errors. From here, drafts stream as NDJSON lines as each part is ready.
  res.status(200).type('application/x-ndjson').setHeader('cache-control', 'no-store');
  res.flushHeaders();
  const line = (l: AiGenerateLine) => res.write(`${JSON.stringify(l)}\n`);
  try {
    const count = await streamDrafts(input, (drafts) => line({ drafts }));
    line({ done: true, count });
  } catch (err) {
    const e =
      err instanceof HttpError
        ? { code: err.code, message: err.message }
        : { code: 'AI_FAILED', message: "The AI couldn't help this time. Try again, or carry on by hand." };
    if (!(err instanceof HttpError)) console.error('[getit] AI generate failed', err);
    line({ done: true, error: e });
  }
  res.end();
});

aiRouter.post('/sessions/:code/ai/keypoints', requireInstructor, async (req, res) => {
  const { code } = parse(codeParamSchema, req.params);
  const s = await getHostSession(instructorId(res), code);
  assertReady(res);
  res.json(await suggestKeyPoints(s.id, s.topic));
});

aiRouter.post('/activities/:id/ai/sort', requireInstructor, async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  const a = await ownedActivity(instructorId(res), id);
  assertReady(res);
  res.json(await sortExplainAnswers(a));
});

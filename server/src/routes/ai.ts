import { Router, type Response } from 'express';
import { aiGenerateSchema, codeParamSchema, idParamSchema, type AiStatus } from '@getit/shared';
import { instructorId, requireInstructor } from '../auth/middleware';
import { HttpError } from '../lib/errors';
import { FixedWindowLimiter } from '../lib/rateLimit';
import { parse } from '../lib/validate';
import { aiEnabled, sortExplainAnswers, suggestKeyPoints, suggestTopics } from '../services/ai';
import { isAiJobRunning } from '../services/ai-job-store';
import { ownedActivity } from '../services/qa-access';
import { startAiJob } from '../realtime/ai-jobs';
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

/**
 * Starts generation in the background and answers at once (202). Drafts appear in the activities list
 * as "AI drafts" while the AI writes them; the instructor can close the dialog and keep teaching.
 */
aiRouter.post('/sessions/:code/ai/generate', requireInstructor, async (req, res) => {
  const { code } = parse(codeParamSchema, req.params);
  const input = parse(aiGenerateSchema, req.body);
  const s = await getHostSession(instructorId(res), code);
  if (s.status !== 'LIVE') throw new HttpError(409, 'SESSION_ENDED', 'This session has ended.');
  if (isAiJobRunning(s.id))
    throw new HttpError(409, 'AI_JOB_RUNNING', 'Drafts are already being prepared for this lecture.');
  assertReady(res);
  res.status(202).json({ job: startAiJob(s.id, input) });
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

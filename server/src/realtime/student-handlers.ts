import {
  answerSchema,
  askQuestionSchema,
  confidenceSchema,
  explainSubmitSchema,
  meTooSchema,
} from '@getit/shared';
import { HttpError } from '../lib/errors';
import { FixedWindowLimiter } from '../lib/rateLimit';
import { askQuestion } from '../services/questions';
import { setMeToo } from '../services/topics';
import { emitToHost, emitTopicCounts, safeEmit, scheduleStats } from './broadcast';
import { handle } from './handle';
import { setConfidence, submitAnswer, submitExplain } from '../services/responses';
import type { IoSocket } from './socket';

export function registerStudentHandlers(socket: IoSocket) {
  const { sessionId, deviceHash, role } = socket.data;
  if (role !== 'student' || !deviceHash) return;

  socket.on(
    'question:ask',
    handle(async (payload: unknown) => {
      const parsed = askQuestionSchema.safeParse(payload);
      if (!parsed.success) throw new HttpError(400, 'VALIDATION', 'Invalid question.');
      const outcome = await askQuestion(sessionId, deviceHash, parsed.data.text);
      // Rules 5 + 6: stored, blocked and rate-limited all get exactly this same ack.
      if (outcome.kind === 'stored') {
        emitToHost(sessionId, 'question:new', { version: outcome.version, question: outcome.question });
      } else if (outcome.kind === 'blocked') {
        const { kind: _kind, ...counts } = outcome;
        emitToHost(sessionId, 'qa:flagged', counts);
      }
      return { sentAt: new Date().toISOString() };
    }),
  );

  // Me too fans out to the whole class: cap each phone at a human pace (questions have their own limits).
  const meTooLimiter = new FixedWindowLimiter(10, 10_000);
  socket.on(
    'topic:metoo',
    handle(async (payload: unknown) => {
      if (!meTooLimiter.hit(socket.id))
        throw new HttpError(429, 'RATE_LIMITED', 'Slow down a little and try again.');
      const parsed = meTooSchema.safeParse(payload);
      if (!parsed.success) throw new HttpError(400, 'VALIDATION', 'Invalid request.');
      const r = await setMeToo(sessionId, deviceHash, parsed.data.topicId, parsed.data.on);
      safeEmit(emitTopicCounts(sessionId, r.version));
      return { on: r.on, meTooCount: r.meTooCount };
    }),
  );

  socket.on(
    'activity:answer',
    handle(async (payload: unknown) => {
      const parsed = answerSchema.safeParse(payload);
      if (!parsed.success) throw new HttpError(400, 'VALIDATION', 'Invalid answer.');
      const { mine, created } = await submitAnswer(sessionId, deviceHash, parsed.data);
      if (created) scheduleStats(sessionId, parsed.data.activityId);
      return mine;
    }),
  );

  socket.on(
    'explain:submit',
    handle(async (payload: unknown) => {
      const parsed = explainSubmitSchema.safeParse(payload);
      if (!parsed.success) throw new HttpError(400, 'VALIDATION', 'Invalid answer.');
      const r = await submitExplain(sessionId, deviceHash, parsed.data);
      // Stealth: stored, blocked and duplicate all ack the same `mine` shape.
      if (r.created) scheduleStats(sessionId, parsed.data.activityId);
      if (r.flagged) emitToHost(sessionId, 'qa:flagged', r.flagged);
      return r.mine;
    }),
  );

  socket.on(
    'activity:confidence',
    handle(async (payload: unknown) => {
      const parsed = confidenceSchema.safeParse(payload);
      if (!parsed.success) throw new HttpError(400, 'VALIDATION', 'Invalid request.');
      return setConfidence(sessionId, deviceHash, parsed.data);
    }),
  );
}

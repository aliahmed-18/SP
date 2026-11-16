import { answerSchema, askQuestionSchema, confidenceSchema, meTooSchema } from '@getit/shared';
import { HttpError } from '../lib/errors';
import { askQuestion } from '../services/questions';
import { setMeToo } from '../services/topics';
import { emitToHost, emitTopicCounts, safeEmit, scheduleStats } from './broadcast';
import { handle } from './handle';
import { setConfidence, submitAnswer } from '../services/responses';
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

  socket.on(
    'topic:metoo',
    handle(async (payload: unknown) => {
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
    'activity:confidence',
    handle(async (payload: unknown) => {
      const parsed = confidenceSchema.safeParse(payload);
      if (!parsed.success) throw new HttpError(400, 'VALIDATION', 'Invalid request.');
      return setConfidence(sessionId, deviceHash, parsed.data);
    }),
  );
}

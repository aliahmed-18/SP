import { askQuestionSchema, meTooSchema, type Ack, type AckError } from '@getit/shared';
import { HttpError } from '../lib/errors';
import { askQuestion } from '../services/questions';
import { setMeToo } from '../services/topics';
import { emitToHost, emitTopicCounts, safeEmit } from './broadcast';
import type { IoSocket } from './socket';

const INTERNAL: AckError = { code: 'INTERNAL', message: 'Something went wrong. Please try again.' };

function toAckError(err: unknown): AckError {
  if (err instanceof HttpError) return { code: err.code, message: err.message };
  console.error('[getit] socket handler failed', err);
  return INTERNAL;
}

/** Wrap a handler: validate the ack callback exists, catch everything, always answer (docs/04 §Rules). */
function handle<P, R>(fn: (payload: P) => Promise<R>) {
  return async (payload: P, ack: unknown) => {
    const reply = typeof ack === 'function' ? (ack as (res: Ack<R>) => void) : () => undefined;
    try {
      reply({ ok: true, data: await fn(payload) });
    } catch (err) {
      reply({ ok: false, error: toAckError(err) });
    }
  };
}

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
}

import type { Ack, AckError } from '@getit/shared';
import { HttpError } from '../lib/errors';

const INTERNAL: AckError = { code: 'INTERNAL', message: 'Something went wrong. Please try again.' };

function toAckError(err: unknown): AckError {
  if (err instanceof HttpError) return { code: err.code, message: err.message };
  console.error('[getit] socket handler failed', err);
  return INTERNAL;
}

/** Wrap a handler: validate the ack callback exists, catch everything, always answer (docs/04 §Rules). */
export function handle<P, R>(fn: (payload: P) => Promise<R>) {
  return async (payload: P, ack: unknown) => {
    const reply = typeof ack === 'function' ? (ack as (res: Ack<R>) => void) : () => undefined;
    try {
      reply({ ok: true, data: await fn(payload) });
    } catch (err) {
      reply({ ok: false, error: toAckError(err) });
    }
  };
}

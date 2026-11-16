import { activityIdSchema, closeActivitySchema } from '@getit/shared';
import { HttpError } from '../lib/errors';
import {
  closeActivity,
  launchActivity,
  newRound,
  revealActivity,
  undoActivity,
  type LifecycleResult,
} from '../services/activities';
import { emitActivityChanged, safeEmit } from './broadcast';
import { handle } from './handle';
import type { IoSocket } from './socket';

/** Activity lifecycle from the host view and the projector (docs/04). Every change is broadcast. */
export function registerHostHandlers(socket: IoSocket) {
  const { role, sessionId } = socket.data;
  if (role !== 'host' && role !== 'present') return;

  const lifecycle = (
    event: 'activity:launch' | 'activity:reveal' | 'activity:newRound' | 'activity:undo',
    run: (id: string) => Promise<LifecycleResult>,
  ) =>
    socket.on(
      event,
      handle(async (payload: unknown) => {
        const parsed = activityIdSchema.safeParse(payload);
        if (!parsed.success) throw new HttpError(400, 'VALIDATION', 'Invalid request.');
        safeEmit(emitActivityChanged(await run(parsed.data.activityId)));
        return undefined;
      }),
    );

  lifecycle('activity:launch', (id) => launchActivity(sessionId, id));
  lifecycle('activity:reveal', (id) => revealActivity(sessionId, id));
  lifecycle('activity:newRound', (id) => newRound(sessionId, id));
  lifecycle('activity:undo', (id) => undoActivity(sessionId, id));

  socket.on(
    'activity:close',
    handle(async (payload: unknown) => {
      const parsed = closeActivitySchema.safeParse(payload);
      if (!parsed.success) throw new HttpError(400, 'VALIDATION', 'Invalid request.');
      safeEmit(
        emitActivityChanged(await closeActivity(sessionId, parsed.data.activityId, parsed.data.reveal)),
      );
      return undefined;
    }),
  );
}

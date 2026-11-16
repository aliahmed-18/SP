import {
  ADD_TIME_SECONDS,
  activityIdSchema,
  closeActivitySchema,
  launchSchema,
  presentSettingsSchema,
  projectPayloadSchema,
} from '@getit/shared';
import type { z } from 'zod';
import { HttpError } from '../lib/errors';
import {
  addTime,
  closeActivity,
  launchActivity,
  newRound,
  revealActivity,
  undoActivity,
  type LifecycleResult,
} from '../services/activities';
import { saveSettings, setProjected } from '../services/presentation';
import { emitActivityChanged, emitPresentSnapshot, emitProjected, safeEmit } from './broadcast';
import { handle } from './handle';
import type { IoSocket } from './socket';
import { syncTimer } from './timers';

/** Activity lifecycle + projector control from the host view and the projector (docs/04). */
export function registerHostHandlers(socket: IoSocket) {
  const { role, sessionId } = socket.data;
  if (role !== 'host' && role !== 'present') return;

  function parse<S extends z.ZodType>(schema: S, payload: unknown): z.output<S> {
    const parsed = schema.safeParse(payload);
    if (!parsed.success) throw new HttpError(400, 'VALIDATION', 'Invalid request.');
    return parsed.data;
  }

  /** Every lifecycle change: (re)arm or clear the timer, then tell every screen. */
  const after = (r: LifecycleResult) => {
    syncTimer(r.activity);
    safeEmit(emitActivityChanged(r));
    if (r.activity.status === 'LIVE') safeEmit(emitProjected(sessionId)); // launch cleared any projection
    return undefined;
  };

  socket.on(
    'activity:launch',
    handle(async (p: unknown) => {
      const { activityId, timerSec } = parse(launchSchema, p);
      return after(await launchActivity(sessionId, activityId, timerSec ?? 0));
    }),
  );
  socket.on(
    'activity:newRound',
    handle(async (p: unknown) => {
      const { activityId, timerSec } = parse(launchSchema, p);
      return after(await newRound(sessionId, activityId, timerSec ?? 0));
    }),
  );
  socket.on(
    'activity:close',
    handle(async (p: unknown) => {
      const { activityId, reveal } = parse(closeActivitySchema, p);
      return after(await closeActivity(sessionId, activityId, reveal));
    }),
  );
  socket.on(
    'activity:reveal',
    handle(async (p: unknown) =>
      after(await revealActivity(sessionId, parse(activityIdSchema, p).activityId)),
    ),
  );
  socket.on(
    'activity:undo',
    handle(async (p: unknown) => after(await undoActivity(sessionId, parse(activityIdSchema, p).activityId))),
  );
  socket.on(
    'activity:addTime',
    handle(async (p: unknown) =>
      after(await addTime(sessionId, parse(activityIdSchema, p).activityId, ADD_TIME_SECONDS)),
    ),
  );

  socket.on(
    'present:project',
    handle(async (p: unknown) => {
      await setProjected(sessionId, parse(projectPayloadSchema, p).item);
      safeEmit(emitProjected(sessionId));
      return undefined;
    }),
  );
  socket.on(
    'present:settings',
    handle(async (p: unknown) => {
      await saveSettings(sessionId, parse(presentSettingsSchema, p));
      safeEmit(emitPresentSnapshot(sessionId));
      return undefined;
    }),
  );
}

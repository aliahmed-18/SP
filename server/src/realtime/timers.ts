import type { Activity } from '@prisma/client';
import { prisma } from '../db';
import { closeActivity } from '../services/activities';
import { readSettings } from '../services/presentation';
import { emitActivityChanged, safeEmit } from './broadcast';

// Server-side question timers (spec D.4): the activity auto-closes at `closesAt`, even if the
// projector tab was closed or refreshed. One timeout per activity; a later closesAt replaces it.
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const MAX_DELAY = 2 ** 31 - 1;

export function syncTimer(a: Pick<Activity, 'id' | 'sessionId' | 'status' | 'closesAt'>) {
  const existing = timers.get(a.id);
  if (existing) clearTimeout(existing);
  timers.delete(a.id);
  if (a.status !== 'LIVE' || !a.closesAt) return;
  const delay = Math.min(MAX_DELAY, Math.max(0, a.closesAt.getTime() - Date.now()));
  const t = setTimeout(() => {
    timers.delete(a.id);
    void expire(a.sessionId, a.id);
  }, delay);
  t.unref?.();
  timers.set(a.id, t);
}

/** Close if still LIVE and its (possibly extended) time is really up; reveal per the projector setting. */
async function expire(sessionId: string, activityId: string) {
  try {
    const a = await prisma.activity.findUnique({ where: { id: activityId }, include: { session: true } });
    if (!a || a.status !== 'LIVE' || !a.closesAt) return;
    if (a.closesAt.getTime() > Date.now() + 50) return syncTimer(a); // extended meanwhile
    const { autoReveal } = readSettings(a.session.presentSettings);
    safeEmit(emitActivityChanged(await closeActivity(sessionId, activityId, autoReveal)));
  } catch (err) {
    // e.g. someone closed it at the same moment: nothing to do.
    console.warn('[getit] timer close skipped', (err as Error).message);
  }
}

/** Startup + safety net: (re)arm every running timer and close overdue ones. */
export async function reconcileTimers() {
  const running = await prisma.activity.findMany({ where: { status: 'LIVE', closesAt: { not: null } } });
  running.forEach(syncTimer);
  return running.length;
}

export function stopAllTimers() {
  timers.forEach(clearTimeout);
  timers.clear();
}

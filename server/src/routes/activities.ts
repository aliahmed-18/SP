import { Router } from 'express';
import {
  activityTextFixSchema,
  codeParamSchema,
  copyActivitiesSchema,
  idParamSchema,
  quickCheckDraftSchema,
  reorderSchema,
} from '@getit/shared';
import { instructorId, requireInstructor } from '../auth/middleware';
import { prisma } from '../db';
import { HttpError } from '../lib/errors';
import { parse } from '../lib/validate';
import { emitHostSnapshot, emitPresentSnapshot, safeEmit } from '../realtime/broadcast';
import { toHostActivity } from '../realtime/dto';
import {
  copyActivities,
  createQuickCheck,
  deleteActivity,
  editActivity,
  reorderActivities,
  statsFor,
} from '../services/activities';
import { ensureNotExpired, getHostSession } from '../services/sessions';

// Activity set-up (docs/03 §Activities). Lifecycle (launch/close/reveal…) goes through Socket.io.
export const activitiesRouter = Router();
activitiesRouter.use('/activities', requireInstructor);

async function ownedActivity(instructor: string, id: string) {
  const a = await prisma.activity.findUnique({ where: { id }, include: { session: true } });
  if (!a || a.session.instructorId !== instructor)
    throw new HttpError(404, 'NOT_FOUND', 'Activity not found.');
  await ensureNotExpired(a.session);
  return a;
}

function structureChanged(sessionId: string) {
  safeEmit(emitHostSnapshot(sessionId));
  safeEmit(emitPresentSnapshot(sessionId));
}

activitiesRouter.post('/sessions/:code/activities', requireInstructor, async (req, res) => {
  const { code } = parse(codeParamSchema, req.params);
  const draft = parse(quickCheckDraftSchema, req.body);
  const s = await getHostSession(instructorId(res), code);
  const { activity } = await createQuickCheck(s.id, draft);
  structureChanged(s.id);
  res.status(201).json(toHostActivity(activity, []));
});

activitiesRouter.patch('/activities/:id', async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  const a = await ownedActivity(instructorId(res), id);
  const change =
    a.status === 'DRAFT'
      ? { full: parse(quickCheckDraftSchema, req.body) }
      : { text: parse(activityTextFixSchema, req.body) };
  const { activity } = await editActivity(a, change);
  structureChanged(a.sessionId);
  res.json(toHostActivity(activity, await statsFor(activity)));
});

activitiesRouter.delete('/activities/:id', async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  const a = await ownedActivity(instructorId(res), id);
  await deleteActivity(a);
  structureChanged(a.sessionId);
  res.status(204).end();
});

activitiesRouter.post('/sessions/:code/activities/reorder', requireInstructor, async (req, res) => {
  const { code } = parse(codeParamSchema, req.params);
  const { ids } = parse(reorderSchema, req.body);
  const s = await getHostSession(instructorId(res), code);
  await reorderActivities(s.id, ids);
  structureChanged(s.id);
  res.status(204).end();
});

/** Copy activities from one of my earlier sessions (the seeded templates, last year's lecture…). */
activitiesRouter.post('/sessions/:code/activities/copy', requireInstructor, async (req, res) => {
  const { code } = parse(codeParamSchema, req.params);
  const { fromSessionId } = parse(copyActivitiesSchema, req.body);
  const me = instructorId(res);
  const s = await getHostSession(me, code);
  if (s.id === fromSessionId) throw new HttpError(400, 'VALIDATION', 'Choose a different session.');
  const { copied } = await copyActivities(me, s.id, fromSessionId);
  structureChanged(s.id);
  res.status(201).json({ copied });
});

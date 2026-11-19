import { Router } from 'express';
import {
  activityDraftSchema,
  activityTextFixSchema,
  codeParamSchema,
  copyActivitiesSchema,
  explainTextFixSchema,
  idParamSchema,
  quickCheckDraftSchema,
  reorderSchema,
  tagSchema,
} from '@getit/shared';
import { instructorId, requireInstructor } from '../auth/middleware';
import { HttpError } from '../lib/errors';
import { parse } from '../lib/validate';
import { emitHostSnapshot, emitPresentSnapshot, emitStudentStage, safeEmit } from '../realtime/broadcast';
import { NO_RESULTS, toHostActivity } from '../realtime/dto';
import {
  activityResults,
  confirmAiDrafts,
  copyActivities,
  createExplain,
  createQuickCheck,
  deleteActivity,
  editActivity,
  reorderActivities,
} from '../services/activities';
import { tagExplainAnswer } from '../services/responses';
import { ownedActivity } from '../services/qa-access';
import { getHostSession } from '../services/sessions';

// Activity set-up (docs/03 §Activities). Lifecycle (launch/close/reveal…) goes through Socket.io.
export const activitiesRouter = Router();
activitiesRouter.use('/activities', requireInstructor);

function structureChanged(sessionId: string) {
  safeEmit(emitHostSnapshot(sessionId));
  safeEmit(emitPresentSnapshot(sessionId));
  safeEmit(emitStudentStage(sessionId)); // an edited / deleted stage activity must update phones (rule 8)
}

activitiesRouter.post('/sessions/:code/activities', requireInstructor, async (req, res) => {
  const { code } = parse(codeParamSchema, req.params);
  const draft = parse(activityDraftSchema, req.body);
  const s = await getHostSession(instructorId(res), code);
  const { activity } =
    draft.type === 'EXPLAIN' ? await createExplain(s.id, draft) : await createQuickCheck(s.id, draft);
  structureChanged(s.id);
  res.status(201).json(toHostActivity(activity, NO_RESULTS));
});

activitiesRouter.patch('/activities/:id', async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  const a = await ownedActivity(instructorId(res), id);
  const change =
    a.type === 'EXPLAIN'
      ? { explain: parse(explainTextFixSchema, req.body) }
      : a.status === 'DRAFT'
        ? { full: parse(quickCheckDraftSchema, req.body) }
        : { text: parse(activityTextFixSchema, req.body) };
  const { activity } = await editActivity(a, change);
  structureChanged(a.sessionId);
  res.json(toHostActivity(activity, await activityResults(activity)));
});

/** Confirm one AI draft (reviewed): it can now be launched. */
activitiesRouter.post('/activities/:id/confirm', async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  const a = await ownedActivity(instructorId(res), id);
  const { count } = await confirmAiDrafts(a.sessionId, a.id);
  structureChanged(a.sessionId);
  res.json({ confirmed: count });
});

/** "Confirm all" AI drafts of the session (the host warns first: AI drafts can contain mistakes). */
activitiesRouter.post('/sessions/:code/activities/confirm-ai', requireInstructor, async (req, res) => {
  const { code } = parse(codeParamSchema, req.params);
  const s = await getHostSession(instructorId(res), code);
  const { count } = await confirmAiDrafts(s.id);
  structureChanged(s.id);
  res.json({ confirmed: count });
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

/** Explain answer tag (Correct / Partial / Misconception, or null to clear). */
activitiesRouter.patch('/responses/:id/tag', requireInstructor, async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  const { tag } = parse(tagSchema, req.body);
  const { sessionId } = await tagExplainAnswer(instructorId(res), id, tag);
  safeEmit(emitHostSnapshot(sessionId));
  res.status(204).end();
});

import { Router } from 'express';
import { codeParamSchema, takeawaySaveSchema } from '@getit/shared';
import { instructorId, requireInstructor } from '../auth/middleware';
import { parse } from '../lib/validate';
import { emitHostSnapshot, emitStudentTopics, emitTakeawayPublished, safeEmit } from '../realtime/broadcast';
import { getHostSession, getPublicSession } from '../services/sessions';
import { getPublicTakeaway, getTakeawayDraft, publishTakeaway, saveTakeaway } from '../services/takeaway';

// docs/03 §Take-away
export const takeawayRouter = Router();

takeawayRouter.get('/sessions/:code/takeaway/draft', requireInstructor, async (req, res) => {
  const { code } = parse(codeParamSchema, req.params);
  res.json(await getTakeawayDraft(await getHostSession(instructorId(res), code)));
});

takeawayRouter.put('/sessions/:code/takeaway', requireInstructor, async (req, res) => {
  const { code } = parse(codeParamSchema, req.params);
  const input = parse(takeawaySaveSchema, req.body);
  const s = await getHostSession(instructorId(res), code);
  const { published } = await saveTakeaway(s, input);
  if (published) emitTakeawayPublished(s.id); // edits after publishing reach phones too
  if (Object.values(input.replies).some(Boolean)) {
    // Filled-in replies change topics: host Q&A panel and phones' topic lists (rule 8).
    safeEmit(emitHostSnapshot(s.id));
    safeEmit(emitStudentTopics(s.id));
  }
  res.json(await getTakeawayDraft(s));
});

takeawayRouter.post('/sessions/:code/takeaway/publish', requireInstructor, async (req, res) => {
  const { code } = parse(codeParamSchema, req.params);
  const s = await getHostSession(instructorId(res), code);
  await publishTakeaway(s);
  emitTakeawayPublished(s.id);
  res.json(await getTakeawayDraft(s));
});

takeawayRouter.get('/public/sessions/:code/takeaway', async (req, res) => {
  const { code } = parse(codeParamSchema, req.params);
  res.json(await getPublicTakeaway(await getPublicSession(code)));
});

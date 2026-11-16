import { Router } from 'express';
import { z } from 'zod';
import { codeParamSchema, createSessionSchema } from '@getit/shared';
import { instructorId, requireInstructor } from '../auth/middleware';
import { parse } from '../lib/validate';
import { buildHostState } from '../realtime/broadcast';
import { createSession, endHostSession, getHostSession, listSessions } from '../services/sessions';

export const sessionsRouter = Router();
sessionsRouter.use('/sessions', requireInstructor);

const listQuery = z.object({
  /** `none` = sessions without a course (e.g. after the course was deleted). */
  courseId: z.union([z.literal('none'), z.string().uuid()]).optional(),
});

sessionsRouter.get('/sessions', async (req, res) => {
  const { courseId } = parse(listQuery, req.query);
  const filter = courseId === undefined ? {} : { courseId: courseId === 'none' ? null : courseId };
  res.json(await listSessions(instructorId(res), filter));
});

sessionsRouter.post('/sessions', async (req, res) => {
  res.status(201).json(await createSession(instructorId(res), parse(createSessionSchema, req.body)));
});

sessionsRouter.get('/sessions/:code/host', async (req, res) => {
  const { code } = parse(codeParamSchema, req.params);
  const s = await getHostSession(instructorId(res), code);
  res.json(await buildHostState(s.id));
});

sessionsRouter.post('/sessions/:code/end', async (req, res) => {
  const { code } = parse(codeParamSchema, req.params);
  const s = await endHostSession(instructorId(res), code);
  res.json(await buildHostState(s.id));
});

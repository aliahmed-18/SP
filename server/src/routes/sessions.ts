import { Router } from 'express';
import { z } from 'zod';
import { codeParamSchema, createSessionSchema, idParamSchema } from '@getit/shared';
import { instructorId, requireInstructor } from '../auth/middleware';
import { parse } from '../lib/validate';
import { buildHostState } from '../realtime/broadcast';
import { prisma } from '../db';
import { HttpError } from '../lib/errors';
import { buildWorkbook, exportFileName } from '../services/export';
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

/** Excel export (spec G), owner only. */
sessionsRouter.get('/sessions/:id/export.xlsx', async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  const s = await prisma.session.findUnique({ where: { id } });
  if (!s || s.instructorId !== instructorId(res)) throw new HttpError(404, 'NOT_FOUND', 'Session not found.');
  const wb = await buildWorkbook(s);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${exportFileName(s)}"`);
  await wb.xlsx.write(res);
  res.end();
});

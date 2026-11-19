import { Router } from 'express';
import { z } from 'zod';
import { codeParamSchema, createSessionSchema, idParamSchema, updateScheduleSchema } from '@getit/shared';
import { instructorId, requireInstructor } from '../auth/middleware';
import { env, isProd } from '../env';
import { HttpError } from '../lib/errors';
import { lectureIcs } from '../lib/ics';
import { publicUrl } from '../lib/public-url';
import { parse } from '../lib/validate';
import { buildHostState, emitHostSnapshot, safeEmit } from '../realtime/broadcast';
import { ownedSession } from '../services/qa-access';
import { buildWorkbook, exportFileName } from '../services/export';
import {
  cancelScheduled,
  createSession,
  endHostSession,
  getHostSession,
  listSessions,
  startHostSession,
  updateSchedule,
} from '../services/sessions';

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

// ─── Calendar: planned lectures ─────────────────────────────────────────────

/** "Start now" on a planned lecture (it would also start by itself at its time if auto-start is on). */
sessionsRouter.post('/sessions/:code/start', async (req, res) => {
  const { code } = parse(codeParamSchema, req.params);
  const s = await startHostSession(instructorId(res), code);
  res.json(await buildHostState(s.id));
});

/** Change a planned lecture's topic, course, time, length or auto-start. */
sessionsRouter.patch('/sessions/:code/schedule', async (req, res) => {
  const { code } = parse(codeParamSchema, req.params);
  const s = await updateSchedule(instructorId(res), code, parse(updateScheduleSchema, req.body));
  safeEmit(emitHostSnapshot(s.id));
  res.json(await buildHostState(s.id));
});

/** Cancel a planned lecture (only before it starts). */
sessionsRouter.delete('/sessions/:code', async (req, res) => {
  const { code } = parse(codeParamSchema, req.params);
  await cancelScheduled(instructorId(res), code);
  res.status(204).end();
});

/** "Add to calendar": the planned lecture as an .ics event (with a 15-minute reminder). */
sessionsRouter.get('/sessions/:id/calendar.ics', async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  const s = await ownedSession(instructorId(res), id);
  if (!s.scheduledFor)
    throw new HttpError(409, 'NOT_SCHEDULED', 'This lecture was not planned in the calendar.');
  const baseUrl = publicUrl() ?? (isProd ? `${req.protocol}://${req.get('host')}` : env.CLIENT_ORIGIN);
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="getit-${s.code.toLowerCase()}.ics"`);
  res.send(
    lectureIcs({
      id: s.id,
      topic: s.topic,
      code: s.code,
      start: s.scheduledFor,
      durationMin: s.durationMin,
      baseUrl,
    }),
  );
});

/** Excel export (spec G), owner only. */
sessionsRouter.get('/sessions/:id/export.xlsx', async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  const s = await ownedSession(instructorId(res), id);
  const wb = await buildWorkbook(s);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${exportFileName(s)}"`);
  await wb.xlsx.write(res);
  res.end();
});

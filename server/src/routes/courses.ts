import { Router } from 'express';
import { courseSchema, idParamSchema } from '@getit/shared';
import { instructorId, requireInstructor } from '../auth/middleware';
import { parse } from '../lib/validate';
import { createCourse, deleteCourse, listCourses, renameCourse } from '../services/courses';
import { listSessions } from '../services/sessions';
import { assertOwnsCourse } from '../services/courses';

export const coursesRouter = Router();
coursesRouter.use('/courses', requireInstructor);

coursesRouter.get('/courses', async (_req, res) => {
  res.json(await listCourses(instructorId(res)));
});

coursesRouter.post('/courses', async (req, res) => {
  res.status(201).json(await createCourse(instructorId(res), parse(courseSchema, req.body)));
});

coursesRouter.patch('/courses/:id', async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  await renameCourse(instructorId(res), id, parse(courseSchema, req.body));
  res.status(204).end();
});

coursesRouter.delete('/courses/:id', async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  await deleteCourse(instructorId(res), id);
  res.status(204).end();
});

coursesRouter.get('/courses/:id/sessions', async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  const me = instructorId(res);
  await assertOwnsCourse(me, id);
  res.json(await listSessions(me, { courseId: id }));
});

import type { Activity, Question, Session, Topic } from '@prisma/client';
import { prisma } from '../db';
import { HttpError } from '../lib/errors';
import { ensureNotExpired } from './sessions';

const notFound = (what: string) => new HttpError(404, 'NOT_FOUND', `${what} not found.`);

/** Load a question the instructor owns (via its session). Other instructors get a plain 404. */
export async function ownedQuestion(
  instructorId: string,
  id: string,
): Promise<Question & { session: Session }> {
  const q = await prisma.question.findUnique({ where: { id }, include: { session: true } });
  if (!q || q.session.instructorId !== instructorId) throw notFound('Question');
  return { ...q, session: await ensureNotExpired(q.session) };
}

export async function ownedTopic(instructorId: string, id: string): Promise<Topic & { session: Session }> {
  const t = await prisma.topic.findUnique({ where: { id }, include: { session: true } });
  if (!t || t.session.instructorId !== instructorId) throw notFound('Topic');
  return { ...t, session: await ensureNotExpired(t.session) };
}

export async function ownedActivity(
  instructorId: string,
  id: string,
): Promise<Activity & { session: Session }> {
  const a = await prisma.activity.findUnique({ where: { id }, include: { session: true } });
  if (!a || a.session.instructorId !== instructorId) throw notFound('Activity');
  return { ...a, session: await ensureNotExpired(a.session) };
}

/** A session by id that this instructor owns (export). */
export async function ownedSession(instructorId: string, id: string): Promise<Session> {
  const s = await prisma.session.findUnique({ where: { id } });
  if (!s || s.instructorId !== instructorId) throw notFound('Session');
  return s;
}

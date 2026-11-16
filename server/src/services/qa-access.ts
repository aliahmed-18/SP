import type { Question, Session, Topic } from '@prisma/client';
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

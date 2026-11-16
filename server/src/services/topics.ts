import type { Prisma } from '@prisma/client';
import type { UpdateTopicInput } from '@getit/shared';
import { prisma } from '../db';
import { HttpError } from '../lib/errors';
import { bumpVersion } from './version';

const SAME_PART = 'A topic can only group questions from its own part.';

/** The topic belongs to this session and to one of the allowed parts. */
export async function assertSameSessionPart(
  tx: Prisma.TransactionClient,
  sessionId: string,
  topicId: string,
  partIds: string[],
) {
  const t = await tx.topic.findUnique({ where: { id: topicId }, select: { sessionId: true, partId: true } });
  if (!t || t.sessionId !== sessionId) throw new HttpError(404, 'NOT_FOUND', 'Topic not found.');
  if (partIds.some((p) => p !== t.partId)) throw new HttpError(400, 'WRONG_PART', SAME_PART);
}

/** All the questions exist in this session and share one part; returns that part id (or null if none). */
async function partOfQuestions(tx: Prisma.TransactionClient, sessionId: string, ids: string[]) {
  if (ids.length === 0) return null;
  const rows = await tx.question.findMany({
    where: { id: { in: ids }, sessionId },
    select: { partId: true },
  });
  if (rows.length !== new Set(ids).size)
    throw new HttpError(404, 'NOT_FOUND', 'Some questions were not found.');
  const parts = new Set(rows.map((r) => r.partId));
  if (parts.size > 1) throw new HttpError(400, 'WRONG_PART', SAME_PART);
  return [...parts][0]!;
}

/** Create a topic in the questions' part (or the current part) and move the questions into it. */
export async function createTopic(sessionId: string, title: string, questionIds: string[]) {
  return prisma.$transaction(async (tx) => {
    const partId =
      (await partOfQuestions(tx, sessionId, questionIds)) ??
      (await tx.part.findFirstOrThrow({ where: { sessionId }, orderBy: { number: 'desc' } })).id;
    const topic = await tx.topic.create({ data: { sessionId, partId, title } });
    if (questionIds.length) {
      await tx.question.updateMany({
        where: { id: { in: questionIds }, sessionId },
        data: { topicId: topic.id },
      });
    }
    return { topic, version: await bumpVersion(tx, sessionId) };
  });
}

export async function moveQuestionsToTopic(sessionId: string, topicId: string, questionIds: string[]) {
  return prisma.$transaction(async (tx) => {
    const partId = await partOfQuestions(tx, sessionId, questionIds);
    await assertSameSessionPart(tx, sessionId, topicId, partId ? [partId] : []);
    await tx.question.updateMany({ where: { id: { in: questionIds }, sessionId }, data: { topicId } });
    return { version: await bumpVersion(tx, sessionId) };
  });
}

/** Rename, change status, reply. Answered in class / Replied also mark the topic's questions addressed. */
export async function updateTopic(
  sessionId: string,
  topic: { id: string; reply: string | null },
  input: UpdateTopicInput,
) {
  return prisma.$transaction(async (tx) => {
    const reply = input.reply !== undefined ? input.reply || null : topic.reply;
    if (input.status === 'REPLIED' && !reply) throw new HttpError(400, 'VALIDATION', 'Write a reply first.');
    const updated = await tx.topic.update({
      where: { id: topic.id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.reply !== undefined ? { reply } : {}),
      },
    });
    if (input.status === 'ANSWERED_IN_CLASS' || input.status === 'REPLIED') {
      await tx.question.updateMany({ where: { topicId: topic.id }, data: { addressed: true } });
    }
    return { topic: updated, version: await bumpVersion(tx, sessionId) };
  });
}

/** Questions become ungrouped (FK SetNull); Me toos go with the topic (cascade). */
export async function deleteTopic(sessionId: string, topicId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.topic.delete({ where: { id: topicId } });
    return { version: await bumpVersion(tx, sessionId) };
  });
}

/** Student Me too (one per device per topic, undoable). Count is recomputed from rows, never ++/--. */
export async function setMeToo(sessionId: string, deviceHash: string, topicId: string, on: boolean) {
  return prisma.$transaction(async (tx) => {
    const topic = await tx.topic.findUnique({
      where: { id: topicId },
      select: { sessionId: true, session: { select: { status: true } } },
    });
    if (!topic || topic.sessionId !== sessionId) throw new HttpError(404, 'NOT_FOUND', 'Topic not found.');
    if (topic.session.status !== 'LIVE') throw new HttpError(409, 'SESSION_ENDED', 'The lecture has ended.');
    if (on) await tx.meToo.createMany({ data: [{ topicId, deviceHash }], skipDuplicates: true });
    else await tx.meToo.deleteMany({ where: { topicId, deviceHash } });
    const meTooCount = await tx.meToo.count({ where: { topicId } });
    await tx.topic.update({ where: { id: topicId }, data: { meTooCount } });
    return { on, meTooCount, version: await bumpVersion(tx, sessionId) };
  });
}

/** "New part": a fresh list (e.g. after the break). Earlier parts collapse on the host. */
export async function createPart(sessionId: string) {
  return prisma.$transaction(async (tx) => {
    const last = await tx.part.findFirstOrThrow({ where: { sessionId }, orderBy: { number: 'desc' } });
    const part = await tx.part.create({ data: { sessionId, number: last.number + 1 } });
    return { part, version: await bumpVersion(tx, sessionId) };
  });
}

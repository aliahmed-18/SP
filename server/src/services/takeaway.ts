import {
  TAKEAWAY_VISIBLE_MS,
  sortTopics,
  type PublicTakeaway,
  type TakeawayDraft,
  type TakeawaySaveInput,
  type TakeawayTopic,
} from '@getit/shared';
import type { Session } from '@prisma/client';
import { prisma } from '../db';
import { HttpError } from '../lib/errors';
import { bumpVersion } from './version';

const asStrings = (json: unknown): string[] =>
  Array.isArray(json) ? json.filter((x): x is string => typeof x === 'string') : [];

async function topicsOf(sessionId: string): Promise<TakeawayTopic[]> {
  const rows = await prisma.topic.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { questions: true } } },
  });
  const dtos = rows.map((t) => ({
    id: t.id,
    title: t.title,
    meTooCount: t.meTooCount,
    questionCount: t._count.questions,
    status: t.status,
    reply: t.reply,
  }));
  return sortTopics(
    dtos,
    dtos.flatMap((t) => Array.from({ length: t.questionCount }, () => ({ topicId: t.id }))),
  );
}

function requireEnded(s: Session) {
  if (s.status !== 'ENDED')
    throw new HttpError(409, 'SESSION_LIVE', 'End the session before editing the Take-away.');
}

/** Instructor editor. The draft row is created at End session; recreate it if missing (old data). */
export async function getTakeawayDraft(s: Session): Promise<TakeawayDraft> {
  requireEnded(s);
  const topics = await topicsOf(s.id);
  const t = await prisma.takeaway.upsert({
    where: { sessionId: s.id },
    create: { sessionId: s.id, topTopicIds: topics.slice(0, 5).map((x) => x.id) },
    update: {},
  });
  const ids = new Set(topics.map((x) => x.id));
  return {
    status: t.status,
    keyPoints: asStrings(t.keyPoints),
    topTopicIds: asStrings(t.topTopicIds).filter((id) => ids.has(id)), // a deleted topic drops out
    topics,
    publishedAt: t.publishedAt?.toISOString() ?? null,
  };
}

/** Save key points, chosen topics (in order) and any replies filled in from the editor. */
export async function saveTakeaway(
  s: Session,
  input: TakeawaySaveInput & { replies: Record<string, string> },
) {
  requireEnded(s);
  const own = new Set(
    (await prisma.topic.findMany({ where: { sessionId: s.id }, select: { id: true } })).map((t) => t.id),
  );
  const topTopicIds = [...new Set(input.topTopicIds)];
  if (topTopicIds.some((id) => !own.has(id)) || Object.keys(input.replies).some((id) => !own.has(id))) {
    throw new HttpError(404, 'NOT_FOUND', 'Topic not found.');
  }
  return prisma.$transaction(async (tx) => {
    for (const [topicId, reply] of Object.entries(input.replies)) {
      if (!reply) continue;
      await tx.topic.update({ where: { id: topicId }, data: { reply, status: 'REPLIED' } });
      await tx.question.updateMany({ where: { topicId }, data: { addressed: true } });
    }
    const t = await tx.takeaway.upsert({
      where: { sessionId: s.id },
      create: { sessionId: s.id, keyPoints: input.keyPoints, topTopicIds },
      update: { keyPoints: input.keyPoints, topTopicIds },
    });
    await bumpVersion(tx, s.id);
    return { published: t.status === 'PUBLISHED' };
  });
}

export async function publishTakeaway(s: Session) {
  requireEnded(s);
  const t = await prisma.takeaway.findUnique({ where: { sessionId: s.id } });
  if (!t || asStrings(t.keyPoints).length === 0) {
    throw new HttpError(409, 'EMPTY_TAKEAWAY', 'Add at least one key point before publishing.');
  }
  await prisma.$transaction(async (tx) => {
    await tx.takeaway.update({
      where: { sessionId: s.id },
      data: { status: 'PUBLISHED', publishedAt: t.publishedAt ?? new Date() },
    });
    await bumpVersion(tx, s.id);
  });
}

/** Students: only once published, and only within 24 h of the end (the session lookup enforces the window). */
export async function getPublicTakeaway(s: Session): Promise<PublicTakeaway> {
  const notYet = new HttpError(404, 'NOT_PUBLISHED', 'The instructor is preparing your Take-away.');
  if (s.status !== 'ENDED' || !s.endedAt) throw notYet;
  const t = await prisma.takeaway.findUnique({ where: { sessionId: s.id } });
  if (!t || t.status !== 'PUBLISHED') throw notYet;
  const byId = new Map((await topicsOf(s.id)).map((x) => [x.id, x]));
  return {
    sessionId: s.id,
    topic: s.topic,
    endedAt: s.endedAt.toISOString(),
    expiresAt: new Date(s.endedAt.getTime() + TAKEAWAY_VISIBLE_MS).toISOString(),
    keyPoints: asStrings(t.keyPoints),
    topics: asStrings(t.topTopicIds).flatMap((id) => {
      const x = byId.get(id);
      return x ? [{ title: x.title, meTooCount: x.meTooCount, status: x.status, reply: x.reply }] : [];
    }),
  };
}

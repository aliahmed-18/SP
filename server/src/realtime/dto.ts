// Allow-list DTO builders (CLAUDE.md rule 3: never spread DB rows). No device hash in any of them.
import type { HostPart, HostQuestion, HostTopic, PublicTopic } from '@getit/shared';
import type { Part, Question, Topic } from '@prisma/client';

export const toHostPart = (p: Part): HostPart => ({
  id: p.id,
  number: p.number,
  flaggedCount: p.flaggedCount,
  createdAt: p.createdAt.toISOString(),
});

export const toHostQuestion = (q: Question): HostQuestion => ({
  id: q.id,
  partId: q.partId,
  topicId: q.topicId,
  text: q.text,
  addressed: q.addressed,
  createdAt: q.createdAt.toISOString(),
});

export const toHostTopic = (t: Topic): HostTopic => ({
  id: t.id,
  partId: t.partId,
  title: t.title,
  status: t.status,
  reply: t.reply,
  meTooCount: t.meTooCount,
  createdAt: t.createdAt.toISOString(),
});

export const toPublicTopic = (t: Topic, questionCount: number): PublicTopic => ({
  id: t.id,
  title: t.title,
  status: t.status,
  reply: t.reply,
  meTooCount: t.meTooCount,
  questionCount,
});

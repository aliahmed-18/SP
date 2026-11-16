// Allow-list DTO builders (CLAUDE.md rule 3: never spread DB rows). No device hash in any of them.
import type {
  Answer,
  HostActivity,
  HostPart,
  HostQuestion,
  HostTopic,
  PresentActivity,
  PublicTopic,
  RoundStats,
  StudentActivity,
} from '@getit/shared';
import type { Activity, Part, Question, Topic } from '@prisma/client';

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

// ─── Activities ─────────────────────────────────────────────────────────────

const asOptions = (json: unknown): string[] =>
  Array.isArray(json) ? json.filter((o): o is string => typeof o === 'string') : [];
export const asAnswer = (json: unknown): Answer | null =>
  typeof json === 'number' || typeof json === 'boolean' ? json : null;

/**
 * Rule 3 (no answer leaks). Built field by field: before REVEALED there is no `correct`,
 * `explanation` or `tolerance` key at all. `modelAnswer` never.
 */
export function toStudentActivity(a: Activity): StudentActivity {
  const base: StudentActivity = {
    id: a.id,
    type: a.type,
    kind: a.kind,
    prompt: a.prompt,
    options: asOptions(a.options),
    status: a.status,
    round: a.round,
    closesAt: a.status === 'LIVE' ? (a.closesAt?.toISOString() ?? null) : null,
  };
  if (a.status !== 'REVEALED' || a.type !== 'QUICK_CHECK') return base;
  const correct = asAnswer(a.correct);
  return {
    ...base,
    ...(correct !== null ? { correct } : {}),
    explanation: a.explanation ?? '',
    tolerance: a.tolerance,
  };
}

export function toHostActivity(a: Activity, stats: RoundStats[]): HostActivity {
  return {
    id: a.id,
    type: a.type,
    kind: a.kind,
    prompt: a.prompt,
    options: asOptions(a.options),
    correct: asAnswer(a.correct),
    tolerance: a.tolerance,
    explanation: a.explanation,
    modelAnswer: a.modelAnswer,
    status: a.status,
    round: a.round,
    position: a.position,
    closesAt: a.status === 'LIVE' ? (a.closesAt?.toISOString() ?? null) : null,
    stats,
  };
}

export function toPresentActivity(a: Activity, stats: RoundStats[]): PresentActivity {
  const { modelAnswer: _never, ...rest } = toHostActivity(a, stats);
  return rest;
}

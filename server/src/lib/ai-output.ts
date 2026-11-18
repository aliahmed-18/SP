import { z } from 'zod';
import {
  containsRestrictedWord,
  EXPLAIN_TAGS,
  explainDraftSchema,
  LIMITS,
  quickCheckDraftSchema,
  TAKEAWAY_LIMITS,
  type AiAnswerGroup,
  type AiDraft,
  type AiGenerateKind,
  type AiTopicSuggestion,
} from '@getit/shared';

// Pure checks on what the AI returns. The server is authoritative (rule 1): AI output is untrusted
// input like anything else, so every value is re-validated and anything odd is dropped, never trusted.

const MAX_SUGGESTIONS = 12;

const rawGroups = z.object({
  topics: z.array(
    z.object({
      title: z.string(),
      existingTopic: z.number().int().nullable().optional(),
      questions: z.array(z.number().int()),
    }),
  ),
});

/**
 * AI numbers questions Q1…Qn and existing topics T1…Tn (1-based). Turns that back into ids:
 * each question in at most one suggestion, new topics need ≥ 2 questions, unknown numbers dropped.
 */
export function toSuggestions(
  raw: unknown,
  questions: { id: string }[],
  topics: { id: string; title: string }[],
): AiTopicSuggestion[] {
  const parsed = rawGroups.safeParse(raw);
  if (!parsed.success) return [];
  const used = new Set<string>();
  const out: AiTopicSuggestion[] = [];
  for (const g of parsed.data.topics) {
    const existing = g.existingTopic ? topics[g.existingTopic - 1] : undefined;
    const ids: string[] = [];
    for (const n of g.questions) {
      const q = questions[n - 1];
      if (q && !used.has(q.id) && !ids.includes(q.id)) ids.push(q.id);
    }
    const title = existing
      ? existing.title
      : g.title.replace(/\s+/g, ' ').trim().slice(0, LIMITS.topicTitleMax);
    if (!title || containsRestrictedWord(title)) continue;
    if (ids.length < (existing ? 1 : 2)) continue;
    ids.forEach((id) => used.add(id));
    out.push({ title, topicId: existing?.id ?? null, questionIds: ids });
  }
  return out.sort((a, b) => b.questionIds.length - a.questionIds.length).slice(0, MAX_SUGGESTIONS);
}

const rawChecks = z.object({
  questions: z.array(
    z.object({
      kind: z.string(),
      prompt: z.string(),
      options: z.array(z.string()).nullable().optional(),
      correctOption: z.number().nullable().optional(),
      correctTrue: z.boolean().nullable().optional(),
      correctNumber: z.number().nullable().optional(),
      tolerance: z.number().nullable().optional(),
      explanation: z.string(),
    }),
  ),
});

/** AI questions → drafts that pass the same schema as hand-written ones; anything else is dropped. */
export function toDrafts(raw: unknown, kinds: AiGenerateKind[], count: number): AiDraft[] {
  const parsed = rawChecks.safeParse(raw);
  if (!parsed.success) return [];
  const seen = new Set<string>();
  const out: AiDraft[] = [];
  for (const q of parsed.data.questions) {
    if (!kinds.includes(q.kind as AiGenerateKind)) continue;
    const draft =
      q.kind === 'EXPLAIN'
        ? explainDraftSchema.safeParse({ type: 'EXPLAIN', prompt: q.prompt, modelAnswer: q.explanation })
        : quickCheckDraftSchema.safeParse(
            q.kind === 'MCQ'
              ? {
                  type: 'QUICK_CHECK',
                  kind: 'MCQ',
                  prompt: q.prompt,
                  explanation: q.explanation,
                  options: q.options ?? [],
                  correct: q.correctOption,
                }
              : q.kind === 'TRUE_FALSE'
                ? {
                    type: 'QUICK_CHECK',
                    kind: 'TRUE_FALSE',
                    prompt: q.prompt,
                    explanation: q.explanation,
                    correct: q.correctTrue,
                  }
                : {
                    type: 'QUICK_CHECK',
                    kind: 'NUMERIC',
                    prompt: q.prompt,
                    explanation: q.explanation,
                    correct: q.correctNumber,
                    tolerance: Math.abs(q.tolerance ?? 0),
                  },
          );
    if (!draft.success) continue;
    const d: AiDraft = draft.data;
    const text =
      d.type === 'EXPLAIN'
        ? [d.prompt, d.modelAnswer]
        : [d.prompt, d.explanation, ...('options' in d ? d.options : [])];
    if (text.some(containsRestrictedWord)) continue;
    const key = d.prompt.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
    if (out.length >= count) break;
  }
  return out;
}

const KEY_POINTS_MAX = 5;

/** Suggested Take-away key points: short, clean, no duplicates, at most 5. */
export function toKeyPoints(raw: unknown): string[] {
  const parsed = z.object({ keyPoints: z.array(z.string()) }).safeParse(raw);
  if (!parsed.success) return [];
  const out: string[] = [];
  for (const p of parsed.data.keyPoints) {
    const t = p.replace(/\s+/g, ' ').trim();
    if (!t || t.length > TAKEAWAY_LIMITS.keyPointMax || containsRestrictedWord(t)) continue;
    if (out.some((o) => o.toLowerCase() === t.toLowerCase())) continue;
    out.push(t);
    if (out.length >= KEY_POINTS_MAX) break;
  }
  return out;
}

const rawAnswerGroups = z.object({
  groups: z.array(z.object({ label: z.string(), tag: z.string(), answers: z.array(z.number().int()) })),
});

/** Explain answers (A1…An) → groups with a valid tag; each answer in at most one group. */
export function toAnswerGroups(raw: unknown, answers: { id: string }[]): AiAnswerGroup[] {
  const parsed = rawAnswerGroups.safeParse(raw);
  if (!parsed.success) return [];
  const used = new Set<string>();
  const out: AiAnswerGroup[] = [];
  for (const g of parsed.data.groups) {
    const tag = EXPLAIN_TAGS.find((t) => t === g.tag);
    const label = g.label.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!tag || !label || containsRestrictedWord(label)) continue;
    const ids: string[] = [];
    for (const n of g.answers) {
      const a = answers[n - 1];
      if (a && !used.has(a.id) && !ids.includes(a.id)) ids.push(a.id);
    }
    if (ids.length === 0) continue;
    ids.forEach((id) => used.add(id));
    out.push({ label, tag, answerIds: ids });
  }
  return out;
}

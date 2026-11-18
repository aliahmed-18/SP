import { z } from 'zod';
import {
  containsRestrictedWord,
  LIMITS,
  quickCheckDraftSchema,
  type AiTopicSuggestion,
  type QuickCheckDraft,
  type QuickCheckKind,
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

/** AI questions → Quick Check drafts that pass the same schema as a hand-written one; others dropped. */
export function toDrafts(raw: unknown, kinds: QuickCheckKind[], count: number): QuickCheckDraft[] {
  const parsed = rawChecks.safeParse(raw);
  if (!parsed.success) return [];
  const seen = new Set<string>();
  const out: QuickCheckDraft[] = [];
  for (const q of parsed.data.questions) {
    if (!kinds.includes(q.kind as QuickCheckKind)) continue;
    const base = { type: 'QUICK_CHECK' as const, prompt: q.prompt, explanation: q.explanation };
    const candidate =
      q.kind === 'MCQ'
        ? { ...base, kind: 'MCQ', options: q.options ?? [], correct: q.correctOption }
        : q.kind === 'TRUE_FALSE'
          ? { ...base, kind: 'TRUE_FALSE', correct: q.correctTrue }
          : { ...base, kind: 'NUMERIC', correct: q.correctNumber, tolerance: Math.abs(q.tolerance ?? 0) };
    const draft = quickCheckDraftSchema.safeParse(candidate);
    if (!draft.success) continue;
    const text = [
      draft.data.prompt,
      draft.data.explanation,
      ...('options' in draft.data ? draft.data.options : []),
    ];
    if (text.some(containsRestrictedWord)) continue;
    const key = draft.data.prompt.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(draft.data);
    if (out.length >= count) break;
  }
  return out;
}

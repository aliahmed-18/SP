// Pure rules shared by client and server (CLAUDE.md §5). Each has Vitest tests in rules.test.ts.

// ─── Topics ─────────────────────────────────────────────────────────────────

/** Spec C1: topics sorted by Me too count, then by number of questions (ported from MVP grouping.ts). */
export function sortTopics<T extends { id: string; meTooCount: number }>(
  topics: readonly T[],
  questions: readonly { topicId: string | null }[],
): T[] {
  const counts = new Map<string, number>();
  for (const q of questions) if (q.topicId) counts.set(q.topicId, (counts.get(q.topicId) ?? 0) + 1);
  return [...topics].sort(
    (a, b) => b.meTooCount - a.meTooCount || (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0),
  );
}

// ─── TSV export ("Copy questions" → paste into Excel) ───────────────────────

/** One spreadsheet cell: no tabs/newlines, and never a formula (=, +, -, @ get a leading quote). */
export function tsvCell(value: string): string {
  const cleaned = value.replace(/[\t\r\n]+/g, ' ').trim();
  return /^[=+\-@]/u.test(cleaned) ? `'${cleaned}` : cleaned;
}

type TsvPart = { id: string; number: number };
type TsvTopic = { id: string; partId: string; title: string; meTooCount: number };
type TsvQuestion = { partId: string; topicId: string | null; text: string; createdAt: string };

/**
 * Columns = topics (sorted like the Topics tab) + "Ungrouped"; one row per question index.
 * With more than one part, a leading "Part" column and one block of rows per part.
 */
export function questionsTsv(parts: TsvPart[], topics: TsvTopic[], questions: TsvQuestion[]): string {
  const ordered = [...parts].sort((a, b) => a.number - b.number);
  const multi = ordered.length > 1;
  const byTime = [...questions].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const topicCols = ordered.flatMap((p) =>
    sortTopics(
      topics.filter((t) => t.partId === p.id),
      byTime,
    ),
  );
  const header = [...(multi ? ['Part'] : []), ...topicCols.map((t) => tsvCell(t.title)), 'Ungrouped'];
  const rows: string[][] = [];
  for (const part of ordered) {
    const qs = byTime.filter((q) => q.partId === part.id);
    const cols = [
      ...topicCols.map((t) => qs.filter((q) => q.topicId === t.id).map((q) => tsvCell(q.text))),
      qs.filter((q) => !q.topicId).map((q) => tsvCell(q.text)),
    ];
    const height = Math.max(0, ...cols.map((c) => c.length));
    for (let i = 0; i < height; i++)
      rows.push([...(multi ? [`Part ${part.number}`] : []), ...cols.map((c) => c[i] ?? '')]);
  }
  return [header, ...rows].map((r) => r.join('\t')).join('\n');
}

// ─── Quick Check scoring (ported from MVP activities.ts) ────────────────────

export type Answer = number | boolean;
export type Kind = 'MCQ' | 'TRUE_FALSE' | 'NUMERIC';

/** Numeric: correct if |answer − correct| ≤ tolerance (plus float noise). Others: exact match. */
export function isCorrect(
  answer: Answer,
  correct: Answer,
  kind: Kind | null,
  tolerance: number | null,
): boolean {
  if (kind === 'NUMERIC' && typeof answer === 'number' && typeof correct === 'number') {
    const eps = Number.EPSILON * Math.max(1, Math.abs(answer), Math.abs(correct)) * 4;
    return Math.abs(answer - correct) <= (tolerance ?? 0) + eps;
  }
  return answer === correct;
}

export type Suggestion = 'reExplain' | 'discuss' | 'moveOn';
export const SUGGESTION_TEXT: Record<Suggestion, string> = {
  reExplain: 'Re-explain',
  discuss: 'Discuss with your neighbour, then vote again',
  moveOn: 'Move on',
};

/** Spec C2: < 30 % → re-explain · 30–70 % → discuss + vote again · > 70 % → move on. */
export function suggestion(percentCorrect: number): Suggestion {
  return percentCorrect < 30 ? 'reExplain' : percentCorrect <= 70 ? 'discuss' : 'moveOn';
}

export type RoundStats = {
  round: number;
  count: number;
  /** 0–100, rounded to 1 decimal. */
  percentCorrect: number;
  /** Answered wrong while saying "Sure". */
  sureWrong: number;
  /** MCQ: every option in order · TRUE_FALSE: true, false · NUMERIC: distinct values, most common first. */
  distribution: { answer: Answer; count: number; correct: boolean }[];
};

export function summarizeRound(
  activity: { kind: Kind | null; options: string[]; correct: Answer; tolerance: number | null },
  responses: { answer: Answer; confident: boolean | null }[],
  round: number,
): RoundStats {
  const dist = new Map<Answer, number>();
  if (activity.kind === 'MCQ') activity.options.forEach((_, i) => dist.set(i, 0));
  if (activity.kind === 'TRUE_FALSE') {
    dist.set(true, 0);
    dist.set(false, 0);
  }
  let correct = 0;
  let sureWrong = 0;
  for (const r of responses) {
    dist.set(r.answer, (dist.get(r.answer) ?? 0) + 1);
    if (isCorrect(r.answer, activity.correct, activity.kind, activity.tolerance)) correct++;
    else if (r.confident === true) sureWrong++;
  }
  let distribution = [...dist].map(([answer, count]) => ({
    answer,
    count,
    correct: isCorrect(answer, activity.correct, activity.kind, activity.tolerance),
  }));
  if (activity.kind === 'NUMERIC') {
    distribution = distribution.sort((a, b) => b.count - a.count || Number(a.answer) - Number(b.answer));
  }
  const percent = responses.length ? (100 * correct) / responses.length : 0;
  return {
    round,
    count: responses.length,
    percentCorrect: Math.round(percent * 10) / 10,
    sureWrong,
    distribution,
  };
}

/** Human label for an answer: "B · r = −0.92", "True", "43.04". */
export function answerLabel(kind: Kind | null, options: string[], answer: Answer): string {
  if (kind === 'MCQ' && typeof answer === 'number') {
    return `${String.fromCharCode(65 + answer)} · ${options[answer] ?? ''}`.trim();
  }
  if (typeof answer === 'boolean') return answer ? 'True' : 'False';
  return String(answer);
}

/** Phone input → number: accepts "43,04", Arabic-Indic digits (٤٣٫٠٤), spaces; null if not a number. */
export function parseNumericAnswer(input: string): number | null {
  const western = input
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٫,]/g, '.')
    .replace(/[−–]/g, '-')
    .replace(/\s+/g, '');
  if (!/^-?(\d+\.?\d*|\.\d+)(e-?\d+)?$/i.test(western)) return null;
  const n = Number(western);
  return Number.isFinite(n) && Math.abs(n) <= 1e12 ? n : null;
}

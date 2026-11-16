import { z } from 'zod';
import type { ExplainAnalysis, ExplainResponse } from './explain';

export const quickCheckSchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  kind: z.enum(['MCQ', 'TRUE_FALSE', 'NUMERIC']),
  options: z.array(z.string().trim().min(1).max(300)).max(5),
  correct: z.union([z.number().finite(), z.boolean()]),
  explanation: z.string().trim().min(1).max(2000),
  tolerance: z.number().finite().nonnegative().nullable(),
}).superRefine((d, ctx) => {
  const bad = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (d.kind === 'MCQ' && (d.options.length < 2 || typeof d.correct !== 'number' || !Number.isInteger(d.correct) || d.correct < 0 || d.correct >= d.options.length)) bad('Choose 2–5 options and a correct option');
  if (d.kind === 'TRUE_FALSE' && typeof d.correct !== 'boolean') bad('Choose True or False');
  if (d.kind === 'NUMERIC' && (typeof d.correct !== 'number' || d.tolerance === null)) bad('Set a numeric answer and tolerance');
  if (d.kind !== 'MCQ' && d.options.length !== 0) bad('Options are only for MCQ');
});
export type QuickCheckDraft = z.infer<typeof quickCheckSchema>;
export type Answer = number | boolean;
export type Activity = {
  id: string; type: string; status: string; round: number; prompt: string; kind: string | null;
  options: string[]; correct?: Answer | undefined; explanation?: string | undefined; tolerance?: number | null;
};
export type RoundStats = { round: number; count: number; percentCorrect: number; sureWrong: number; distribution: { answer: Answer; count: number }[] };
export type InstructorActivity = Activity & { source?: string; confirmed?: boolean; correct: Answer; explanation: string; tolerance: number | null; stats: RoundStats[]; responseCount: number; modelAnswer?: string; explainResponses?: ExplainResponse[]; misconceptions?: ExplainAnalysis['misconceptions']; explainFlagged?: number; analysed?: boolean };
export type MyActivity = { id: string; round: number; answer: Answer; confident: boolean };
export function isCorrect(answer: Answer, correct: Answer, kind: string | null, tolerance: number | null) {
  return kind === 'NUMERIC' && typeof answer === 'number' && typeof correct === 'number'
    ? Math.abs(answer - correct) <= (tolerance ?? 0) + Number.EPSILON * Math.max(1, Math.abs(answer), Math.abs(correct))
    : answer === correct;
}
export function suggestion(percent: number): 'reExplain' | 'discuss' | 'moveOn' {
  return percent < 30 ? 'reExplain' : percent <= 70 ? 'discuss' : 'moveOn';
}
export function summarizeRound(activity: Activity, responses: { answer: Answer; confident: boolean | null }[], round: number): RoundStats {
  const distribution = new Map<Answer, number>();
  if (activity.kind === 'MCQ') activity.options.forEach((_, i) => distribution.set(i, 0));
  if (activity.kind === 'TRUE_FALSE') { distribution.set(true, 0); distribution.set(false, 0); }
  let correct = 0, sureWrong = 0;
  responses.forEach(r => {
    distribution.set(r.answer, (distribution.get(r.answer) ?? 0) + 1);
    const ok = activity.correct !== undefined && isCorrect(r.answer, activity.correct, activity.kind, activity.tolerance ?? null);
    if (ok) correct++;
    else if (r.confident) sureWrong++;
  });
  return { round, count: responses.length, percentCorrect: responses.length ? 100 * correct / responses.length : 0, sureWrong, distribution: [...distribution].map(([answer, count]) => ({ answer, count })) };
}
export function publicActivity(a: Activity): Activity {
  const safe: Activity = { id: a.id, type: a.type, status: a.status, round: a.round, prompt: a.prompt, kind: a.kind, options: a.options };
  return a.status === 'REVEALED' ? { ...safe, correct: a.correct, explanation: a.explanation, tolerance: a.tolerance ?? null } : safe;
}
export type SavedCheck = { id: string; round: number; question: string; myAnswer: string; correct: string; explanation: string; confident?: boolean; wasCorrect?: boolean };
export function saveRevealedCheck(code: string, record: SavedCheck) {
  const key = `getit.checks.${code}`;
  let rows: SavedCheck[] = [];
  try { rows = JSON.parse(localStorage.getItem(key) ?? '[]'); } catch { /* recover corrupt local history */ }
  localStorage.setItem(key, JSON.stringify([...rows.filter(r => r.id !== record.id || r.round !== record.round), record]));
}
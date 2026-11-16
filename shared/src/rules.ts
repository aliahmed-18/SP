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

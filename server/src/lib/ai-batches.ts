/**
 * Long material is split into up to 3 parts that the AI drafts from in parallel: each request reads
 * less and writes fewer questions, so the wait is roughly a third — and the drafts cover the whole
 * lecture instead of its first slides. Short material stays one request.
 */
export const BATCH_MIN_CHARS = 6000;
const MAX_BATCHES = 3;

export function splitForBatches(text: string, count: number): { text: string; count: number }[] {
  const n = text.length < BATCH_MIN_CHARS ? 1 : Math.min(MAX_BATCHES, count);
  if (n <= 1) return [{ text, count }];
  // Cut at paragraph (or line) breaks near each 1/n mark, never inside a line.
  const target = text.length / n;
  const parts: string[] = [];
  let start = 0;
  for (let i = 1; i < n; i++) {
    const ideal = Math.round(target * i);
    let cut = text.lastIndexOf('\n\n', ideal);
    if (cut <= start) cut = text.lastIndexOf('\n', ideal);
    if (cut <= start) cut = ideal;
    parts.push(text.slice(start, cut).trim());
    start = cut;
  }
  parts.push(text.slice(start).trim());
  const chunks = parts.filter(Boolean);
  const base = Math.floor(count / chunks.length);
  const extra = count % chunks.length;
  return chunks.map((t, i) => ({ text: t, count: base + (i < extra ? 1 : 0) }));
}

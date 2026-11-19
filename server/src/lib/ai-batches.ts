/**
 * Drafts are written by up to 2 AI requests running in parallel (about 4 questions each — the free
 * Gemini tier allows only a few requests a minute). Each keeps the model's full thinking (quality
 * first); drafts are saved as each request finishes.
 *
 * Long material is cut into one part per request (at paragraph breaks), so the drafts cover the whole
 * lecture. Short material goes whole to every request, each asked to focus on a different idea.
 */
export const BATCH_QUESTIONS = 4;
export const MAX_BATCHES = 2;
/** Below this many characters per part, splitting would leave a part with too little to ask about. */
export const MIN_PART_CHARS = 1500;

export type Batch = { text: string; count: number; part: number; parts: number; split: boolean };

export function planBatches(text: string, count: number): Batch[] {
  const n = Math.max(1, Math.min(MAX_BATCHES, Math.ceil(count / BATCH_QUESTIONS)));
  const base = Math.floor(count / n);
  const extra = count % n;
  const counts = Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
  const split = n > 1 && text.length >= MIN_PART_CHARS * n;
  const texts = split ? cutAtBreaks(text, n) : counts.map(() => text);
  return counts.map((c, i) => ({ text: texts[i] ?? text, count: c, part: i + 1, parts: n, split }));
}

/** n parts of similar length, cut at paragraph (or line) breaks near each 1/n mark. */
function cutAtBreaks(text: string, n: number): string[] {
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
  return parts;
}

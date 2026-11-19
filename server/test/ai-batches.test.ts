// Faster generation: long material → up to 3 parallel requests, merged; one failed part keeps the rest.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AiGenerateResult } from '@getit/shared';
import { prisma } from '../src/db';
import { BATCH_MIN_CHARS, splitForBatches } from '../src/lib/ai-batches';
import { HttpError } from '../src/lib/errors';
import type { AiRequest } from '../src/lib/gemini';
import { aiLimiter } from '../src/routes/ai';
import { setAiClient } from '../src/services/ai';
import { newInstructor, newSession, resetDb } from './helpers';

beforeEach(async () => {
  await resetDb();
  aiLimiter.reset();
});
afterEach(() => setAiClient(null));
afterAll(() => prisma.$disconnect());

/** ~9 000 characters: 30 paragraphs about different ideas. */
const LONG = Array.from(
  { length: 30 },
  (_, i) => `Idea ${i + 1}. ${'The least-squares line minimises squared residuals. '.repeat(6)}`,
).join('\n\n');

const tf = (prompt: string) => ({ kind: 'TRUE_FALSE', prompt, correctTrue: true, explanation: 'Yes.' });

describe('splitForBatches (pure)', () => {
  it('short material: one request with every question', () => {
    expect(splitForBatches('short text', 5)).toEqual([{ text: 'short text', count: 5 }]);
  });

  it('long material: up to 3 parts cut at paragraph breaks, counts shared out, nothing lost', () => {
    expect(LONG.length).toBeGreaterThan(BATCH_MIN_CHARS);
    const parts = splitForBatches(LONG, 8);
    expect(parts.map((p) => p.count)).toEqual([3, 3, 2]);
    expect(parts.every((p) => p.text.startsWith('Idea '))).toBe(true); // never cut mid-paragraph
    const words = (t: string) => t.split(/\s+/).filter(Boolean);
    expect(words(parts.map((p) => p.text).join(' '))).toEqual(words(LONG)); // nothing lost or doubled
    expect(splitForBatches(LONG, 2)).toHaveLength(2); // never more parts than questions
  });
});

describe('parallel generation', () => {
  it('3 requests at once, merged without duplicates; one failed part keeps the others', async () => {
    const { agent } = await newInstructor();
    const s = await newSession(agent);
    const seen: AiRequest[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    setAiClient(async (req) => {
      seen.push(req);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 50));
      inFlight--;
      const part = /part (\d) of 3/.exec(req.prompt)?.[1];
      if (part === '3') throw new HttpError(504, 'AI_TIMEOUT', 'slow');
      return { questions: [tf(`Question from part ${part}?`), tf('Same everywhere?')] };
    });
    const res = await agent
      .post(`/api/sessions/${s.code}/ai/generate`)
      .send({ text: LONG, count: 6, kinds: ['TRUE_FALSE'] });
    expect(res.status).toBe(200);
    expect(seen).toHaveLength(3);
    expect(maxInFlight).toBe(3); // really in parallel
    expect((res.body as AiGenerateResult).drafts.map((d) => d.prompt)).toEqual([
      'Question from part 1?',
      'Same everywhere?',
      'Question from part 2?',
    ]);
  });

  it('every part failing keeps the real reason (e.g. the free limit)', async () => {
    const { agent } = await newInstructor();
    const s = await newSession(agent);
    setAiClient(async () => {
      throw new HttpError(
        429,
        'AI_BUSY',
        'The AI is busy right now (free limit reached). Try again in a minute.',
      );
    });
    const res = await agent.post(`/api/sessions/${s.code}/ai/generate`).send({ text: LONG, count: 5 });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('AI_BUSY');
  });
});

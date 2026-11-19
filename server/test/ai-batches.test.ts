// Smooth AI: small parallel requests, drafts streamed as each finishes, one failure keeps the rest.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { MAX_BATCHES, MIN_PART_CHARS, planBatches } from '../src/lib/ai-batches';
import { HttpError } from '../src/lib/errors';
import type { AiRequest } from '../src/lib/gemini';
import { aiLimiter } from '../src/routes/ai';
import { setAiClient } from '../src/services/ai';
import { generate, newInstructor, newSession, resetDb, startLiveServer } from './helpers';

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
const SHORT = 'The slope b = Sxy / Sxx is the change in y per unit of x. '.repeat(6);
const tf = (prompt: string) => ({ kind: 'TRUE_FALSE', prompt, correctTrue: true, explanation: 'Yes.' });
const words = (t: string) => t.split(/\s+/).filter(Boolean);

describe('planBatches (pure)', () => {
  it('about 2 questions per request, at most 4 requests, counts add up', () => {
    expect(planBatches(SHORT, 1).map((b) => b.count)).toEqual([1]);
    expect(planBatches(SHORT, 5).map((b) => b.count)).toEqual([2, 2, 1]);
    expect(planBatches(SHORT, 8).map((b) => b.count)).toEqual([2, 2, 2, 2]);
    expect(planBatches(LONG, 8)).toHaveLength(MAX_BATCHES);
  });

  it('long material: one part per request, cut at paragraph breaks, nothing lost', () => {
    const parts = planBatches(LONG, 6);
    expect(LONG.length).toBeGreaterThan(MIN_PART_CHARS * parts.length);
    expect(parts.every((p) => p.split && p.text.startsWith('Idea '))).toBe(true);
    expect(words(parts.map((p) => p.text).join(' '))).toEqual(words(LONG));
  });

  it('short material: every request reads all of it (and is asked for different ideas)', () => {
    const parts = planBatches(SHORT, 6);
    expect(parts.every((p) => !p.split && p.text === SHORT)).toBe(true);
  });
});

describe('streamed, parallel generation', () => {
  it('requests run at once; each part streams as it finishes; a failed part keeps the rest', async () => {
    const { agent } = await newInstructor();
    const s = await newSession(agent);
    const seen: AiRequest[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    setAiClient(async (req) => {
      seen.push(req);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const part = Number(/part (\d) of 3/.exec(req.prompt)?.[1]);
      await new Promise((r) => setTimeout(r, 40 * part)); // part 1 first, then 2
      inFlight--;
      if (part === 3) throw new HttpError(504, 'AI_TIMEOUT', 'slow');
      return { questions: [tf(`Question from part ${part}?`), tf('Same everywhere?')] };
    });
    const res = await generate(agent, s.code, { text: LONG, count: 6, kinds: ['TRUE_FALSE'] });
    expect(res.status).toBe(200);
    expect(seen).toHaveLength(3);
    expect(maxInFlight).toBe(3); // really in parallel
    // One line per finished part, in the order they finished, then the summary line.
    expect(res.lines).toEqual([
      {
        drafts: [
          expect.objectContaining({ prompt: 'Question from part 1?' }),
          expect.objectContaining({ prompt: 'Same everywhere?' }),
        ],
      },
      { drafts: [expect.objectContaining({ prompt: 'Question from part 2?' })] }, // duplicate dropped
      { done: true, count: 3 },
    ]);
  });

  it('short material: every writer is told to cover different ideas', async () => {
    const { agent } = await newInstructor();
    const s = await newSession(agent);
    const prompts: string[] = [];
    setAiClient(async (req) => {
      prompts.push(req.prompt);
      return { questions: [tf(`Q${prompts.length}?`)] };
    });
    const res = await generate(agent, s.code, { text: SHORT, count: 4, kinds: ['TRUE_FALSE'] });
    expect(res.drafts).toHaveLength(2);
    expect(prompts.some((p) => p.includes('writer 1 of 2') && p.includes('first quarter'))).toBe(true);
    expect(prompts.some((p) => p.includes('writer 2 of 2') && p.includes('second quarter'))).toBe(true);
  });

  it('every part failing ends the stream with the real reason (e.g. the free limit)', async () => {
    const { agent } = await newInstructor();
    const s = await newSession(agent);
    setAiClient(async () => {
      throw new HttpError(
        429,
        'AI_BUSY',
        'The AI is busy right now (free limit reached). Try again in a minute.',
      );
    });
    const res = await generate(agent, s.code, { text: LONG, count: 5 });
    expect(res.drafts).toEqual([]);
    expect(res.error).toMatchObject({ code: 'AI_BUSY' });
  });
});

describe('streaming over a real connection', () => {
  it('the first drafts arrive while the slowest part is still being written', async () => {
    const server = await startLiveServer();
    try {
      const email = `stream${Date.now()}@example.com`;
      const reg = await fetch(`${server.url}/api/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Dr. Stream', email, password: 'password123' }),
      });
      const cookie = reg.headers.get('set-cookie')!.split(';')[0]!;
      const created = await fetch(`${server.url}/api/sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ topic: 'Streaming' }),
      });
      const { code } = (await created.json()) as { code: string };
      setAiClient(async (req) => {
        const part = Number(/part (\d) of 3/.exec(req.prompt)?.[1]);
        await new Promise((r) => setTimeout(r, part === 3 ? 1500 : 100)); // part 3 is slow
        return { questions: [tf(`From part ${part}?`)] };
      });

      const started = Date.now();
      const res = await fetch(`${server.url}/api/sessions/${code}/ai/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ text: LONG, count: 6, kinds: ['TRUE_FALSE'] }),
      });
      const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
      const arrivals: { at: number; text: string }[] = [];
      for (;;) {
        const { value, done } = await reader.read();
        if (value) arrivals.push({ at: Date.now() - started, text: value });
        if (done) break;
      }
      const firstDraft = arrivals.find((a) => a.text.includes('"drafts"'))!;
      const end = arrivals.at(-1)!;
      expect(firstDraft.at).toBeLessThan(1000); // long before part 3 (1.5 s) is done
      expect(end.at).toBeGreaterThanOrEqual(1400);
      expect(arrivals.map((a) => a.text).join('')).toContain('"done":true,"count":3');
    } finally {
      await server.close();
    }
  });
});

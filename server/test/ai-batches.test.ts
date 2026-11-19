// Background AI generation: few parallel requests (free-tier friendly), drafts saved as each finishes,
// the host page updated live, one failed part keeps the rest.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HostState } from '@getit/shared';
import { prisma } from '../src/db';
import { BATCH_QUESTIONS, MAX_BATCHES, MIN_PART_CHARS, planBatches } from '../src/lib/ai-batches';
import { HttpError } from '../src/lib/errors';
import type { AiRequest } from '../src/lib/gemini';
import { aiLimiter } from '../src/routes/ai';
import { setAiClient } from '../src/services/ai';
import { clearAiJobs, waitForAiJob } from '../src/services/ai-job-store';
import {
  eventWhere,
  generate,
  newInstructor,
  newSession,
  nextEvent,
  resetDb,
  socketToken,
  startLiveServer,
} from './helpers';

beforeEach(async () => {
  await resetDb();
  aiLimiter.reset();
  clearAiJobs();
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
  it(`about ${BATCH_QUESTIONS} questions per request, at most ${MAX_BATCHES} requests at once`, () => {
    expect(planBatches(SHORT, 3).map((b) => b.count)).toEqual([3]);
    expect(planBatches(SHORT, 5).map((b) => b.count)).toEqual([3, 2]);
    expect(planBatches(SHORT, 8).map((b) => b.count)).toEqual([4, 4]);
    expect(planBatches(LONG, 8)).toHaveLength(MAX_BATCHES);
  });

  it('long material: one part per request, cut at paragraph breaks, nothing lost', () => {
    const parts = planBatches(LONG, 8);
    expect(LONG.length).toBeGreaterThan(MIN_PART_CHARS * parts.length);
    expect(parts.every((p) => p.split && p.text.startsWith('Idea '))).toBe(true);
    expect(words(parts.map((p) => p.text).join(' '))).toEqual(words(LONG));
  });

  it('short material: every request reads all of it (and is asked for a different half)', () => {
    expect(planBatches(SHORT, 8).every((p) => !p.split && p.text === SHORT)).toBe(true);
  });
});

describe('background generation', () => {
  it('requests run at once; drafts saved in finishing order; a failed part keeps the rest', async () => {
    const { agent } = await newInstructor();
    const s = await newSession(agent);
    let inFlight = 0;
    let maxInFlight = 0;
    setAiClient(async (req: AiRequest) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const part = Number(/part (\d) of 2/.exec(req.prompt)?.[1]);
      await new Promise((r) => setTimeout(r, 40 * part));
      inFlight--;
      if (part === 2) throw new HttpError(504, 'AI_TIMEOUT', 'slow');
      return { questions: [tf(`Question from part ${part}?`), tf('Another one?')] };
    });
    const res = await generate(agent, s.code, { text: LONG, count: 8, kinds: ['TRUE_FALSE'] });
    expect(maxInFlight).toBe(2);
    expect(res.drafts.map((d) => d.prompt)).toEqual(['Question from part 1?', 'Another one?']);
    expect(res.job).toMatchObject({ status: 'done', received: 2, expected: 8 });
  });

  it('short material: the two writers are told to cover different halves', async () => {
    const { agent } = await newInstructor();
    const s = await newSession(agent);
    const prompts: string[] = [];
    setAiClient(async (req) => {
      prompts.push(req.prompt);
      return { questions: [tf(`Q${prompts.length}?`)] };
    });
    await generate(agent, s.code, { text: SHORT, count: 8, kinds: ['TRUE_FALSE'] });
    expect(prompts.some((p) => p.includes('writer 1 of 2') && p.includes('first half'))).toBe(true);
    expect(prompts.some((p) => p.includes('writer 2 of 2') && p.includes('second half'))).toBe(true);
  });

  it('every part failing: the job says why (e.g. the free limit), nothing saved', async () => {
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
    expect(res.job).toMatchObject({ status: 'failed' });
    expect(res.error).toMatch(/free limit/);
  });
});

describe('the host page while the AI works', () => {
  it('first drafts appear live while the slow part is still being written; the page can reload', async () => {
    const server = await startLiveServer();
    try {
      const { agent } = await newInstructor();
      const s = await newSession(agent);
      const host = server.connect({ role: 'host', code: s.code, token: await socketToken(agent) });
      await nextEvent(host, 'state:host');
      let releaseSlow = () => {};
      setAiClient(async (req) => {
        const part = Number(/part (\d) of 2/.exec(req.prompt)?.[1]);
        if (part === 2) await new Promise<void>((r) => (releaseSlow = r));
        return { questions: [tf(`From part ${part}?`)] };
      });

      const firstDraft = eventWhere(host, 'state:host', (st: HostState) =>
        st.activities.some((a) => a.aiDraft),
      );
      const started = await agent
        .post(`/api/sessions/${s.code}/ai/generate`)
        .send({ text: LONG, count: 8, kinds: ['TRUE_FALSE'] });
      expect(started.status).toBe(202);
      const mid = await firstDraft;
      expect(mid.aiJob).toMatchObject({ status: 'running', received: 1, expected: 8 });
      expect(mid.activities.map((a) => [a.prompt, a.aiDraft])).toEqual([['From part 1?', true]]);

      // A refreshed host page (new snapshot) still knows the job is running.
      const fresh = await agent.get(`/api/sessions/${s.code}/host`);
      expect((fresh.body as HostState).aiJob).toMatchObject({ status: 'running', received: 1 });

      const done = eventWhere(host, 'state:host', (st: HostState) => st.aiJob?.status === 'done');
      releaseSlow();
      const end = await done;
      expect(end.activities.filter((a) => a.aiDraft)).toHaveLength(2);
      await waitForAiJob(s.id);
    } finally {
      await server.close();
    }
  });
});

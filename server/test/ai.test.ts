// AI helpers (stretch): proposals only, owner only, validated output, graceful failure. Uses a fake AI.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AiGroupResult } from '@getit/shared';
import { prisma } from '../src/db';
import { toDrafts, toSuggestions } from '../src/lib/ai-output';
import { aiTimeout, type AiRequest } from '../src/lib/gemini';
import { hashDevice } from '../src/lib/deviceHash';
import { aiLimiter } from '../src/routes/ai';
import { setAiClient } from '../src/services/ai';
import { askQuestion } from '../src/services/questions';
import { generate, newDeviceId, newInstructor, newSession, resetDb } from './helpers';

beforeEach(async () => {
  await resetDb();
  aiLimiter.reset();
});
afterEach(() => setAiClient(null));
afterAll(() => prisma.$disconnect());

const SLIDES =
  'The least-squares regression line ŷ = a + bx minimises the sum of squared residuals. ' +
  'The slope b = Sxy / Sxx is the change in y for each one-unit increase in x. ' +
  'The correlation r measures the strength and direction of a linear relationship and lies between −1 and 1. ' +
  'Correlation does not imply causation.';

async function withQuestions(texts: string[]) {
  const inst = await newInstructor();
  const s = await newSession(inst.agent);
  for (const t of texts) {
    // Different devices: the 5-second rule is per device.
    await askQuestion(s.id, hashDevice(newDeviceId()), t);
  }
  return { ...inst, s };
}

describe('AI helpers', () => {
  it('reports off and refuses when no AI is configured (manual flow unaffected)', async () => {
    const { agent, s } = await withQuestions(['a?', 'b?', 'c?']);
    expect((await agent.get('/api/ai/status')).body).toEqual({ enabled: false });
    const res = await agent.post(`/api/sessions/${s.code}/ai/group`);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('AI_OFF');
  });

  it('group: sends only question text, maps numbers to ids, changes nothing', async () => {
    const { agent, s } = await withQuestions([
      'How do we get Sxy from the table?',
      'Why is the slope negative here?',
      'What is r?',
      'How do we compute the slope b?',
    ]);
    const existing = (
      await agent.post(`/api/sessions/${s.code}/topics`).send({ title: 'Correlation', questionIds: [] })
    ).body as { id: string };
    let seen: AiRequest | undefined;
    setAiClient(async (req) => {
      seen = req;
      return {
        topics: [
          { title: 'Computing the slope', questions: [1, 2, 4, 4, 99] }, // duplicate + unknown dropped
          { title: 'ignored', existingTopic: 1, questions: [3] },
          { title: 'Lonely', questions: [2] }, // already used, and a new topic needs 2
        ],
      };
    });
    expect((await agent.get('/api/ai/status')).body).toEqual({ enabled: true });
    const res = await agent.post(`/api/sessions/${s.code}/ai/group`);
    expect(res.status).toBe(200);
    const qs = await prisma.question.findMany({ where: { sessionId: s.id }, orderBy: { createdAt: 'asc' } });
    const { suggestions } = res.body as AiGroupResult;
    expect(suggestions).toEqual([
      { title: 'Computing the slope', topicId: null, questionIds: [qs[0]!.id, qs[1]!.id, qs[3]!.id] },
      { title: 'Correlation', topicId: existing.id, questionIds: [qs[2]!.id] },
    ]);
    // Anonymity: no device hash, ids or identities in what the AI saw.
    expect(seen!.prompt).toContain('Q1: How do we get Sxy from the table?');
    expect(seen!.prompt).toContain('T1: Correlation');
    for (const q of qs) {
      expect(seen!.prompt).not.toContain(q.deviceHash);
      expect(seen!.prompt).not.toContain(q.id);
    }
    // A proposal only: nothing was grouped.
    expect(qs.every((q) => q.topicId === null)).toBe(true);
  });

  it('group: needs at least 3 ungrouped questions, owner only', async () => {
    setAiClient(async () => ({ topics: [] }));
    const { agent, s } = await withQuestions(['only one?']);
    const few = await agent.post(`/api/sessions/${s.code}/ai/group`);
    expect(few.status).toBe(400);
    expect(few.body.error.code).toBe('NOT_ENOUGH_QUESTIONS');
    const other = await newInstructor('Dr. Other');
    expect((await other.agent.post(`/api/sessions/${s.code}/ai/group`)).status).toBe(404);
  });

  it('generate: validates input, returns only valid drafts that the activities endpoint accepts', async () => {
    const { agent, s } = await withQuestions([]);
    setAiClient(async () => ({
      questions: [
        {
          kind: 'MCQ',
          prompt: 'What does the slope b measure?',
          options: ['Strength', 'Change in y per unit x', 'Causation'],
          correctOption: 1,
          explanation: 'b = Sxy / Sxx is the change in y per unit of x.',
        },
        { kind: 'MCQ', prompt: 'Broken', options: ['only one'], correctOption: 3, explanation: 'x' },
        {
          kind: 'TRUE_FALSE',
          prompt: 'Correlation implies causation.',
          correctTrue: false,
          explanation: 'It does not.',
        },
        { kind: 'NUMERIC', prompt: 'Not an allowed type', correctNumber: 2, tolerance: 0, explanation: 'x' },
      ],
    }));
    const short = await agent.post(`/api/sessions/${s.code}/ai/generate`).send({ text: 'too short' });
    expect(short.status).toBe(400);

    const res = await generate(agent, s.code, { text: SLIDES, count: 5, kinds: ['MCQ', 'TRUE_FALSE'] });
    expect(res.status).toBe(200);
    expect(res.contentType).toMatch(/application\/x-ndjson/);
    expect(res.lines.at(-1)).toEqual({ done: true, count: 2 });
    const drafts = res.drafts;
    // Several small requests ran on the same short text; duplicates across them are dropped.
    expect(drafts.map((d) => d.prompt)).toEqual([
      'What does the slope b measure?',
      'Correlation implies causation.',
    ]);
    // Nothing is created until the instructor adds them; each draft is accepted as-is.
    expect(await prisma.activity.count({ where: { sessionId: s.id } })).toBe(0);
    for (const d of drafts)
      expect((await agent.post(`/api/sessions/${s.code}/activities`).send(d)).status).toBe(201);
    expect(await prisma.activity.count({ where: { sessionId: s.id, status: 'DRAFT' } })).toBe(2);
  });

  it('generate: an AI failure or timeout is a readable error, never a crash', async () => {
    const { agent, s } = await withQuestions([]);
    setAiClient(async () => {
      throw aiTimeout();
    });
    const slow = await generate(agent, s.code, { text: SLIDES });
    expect(slow.error).toMatchObject({ code: 'AI_TIMEOUT' });
    expect(slow.error!.message).toMatch(/carry on by hand/);

    setAiClient(async () => ({ questions: 'nonsense' }));
    const junk = await generate(agent, s.code, { text: SLIDES });
    expect(junk.error).toMatchObject({ code: 'AI_FAILED' });
    expect(junk.drafts).toEqual([]);
  });

  it('rate limit: 20 AI requests per instructor per 10 minutes', async () => {
    const { agent, s } = await withQuestions([]);
    setAiClient(async () => ({
      questions: [
        { kind: 'TRUE_FALSE', prompt: 'r is between −1 and 1.', correctTrue: true, explanation: 'Yes.' },
      ],
    }));
    for (let i = 0; i < 20; i++)
      expect((await agent.post(`/api/sessions/${s.code}/ai/generate`).send({ text: SLIDES })).status).toBe(
        200,
      );
    expect((await agent.post(`/api/sessions/${s.code}/ai/generate`).send({ text: SLIDES })).status).toBe(429);
  });
});

describe('AI output checks (pure)', () => {
  it('drops restricted words and duplicate prompts; caps the count', () => {
    const q = (prompt: string) => ({ kind: 'TRUE_FALSE', prompt, correctTrue: true, explanation: 'ok' });
    const drafts = toDrafts(
      { questions: [q('A?'), q('a?'), q('this is shit'), q('B?'), q('C?')] },
      ['TRUE_FALSE'],
      2,
    );
    expect(drafts.map((d) => d.prompt)).toEqual(['A?', 'B?']);
    expect(toSuggestions('garbage', [], [])).toEqual([]);
    expect(toDrafts({ questions: [{ prompt: 1 }] }, ['MCQ'], 5)).toEqual([]);
  });
});

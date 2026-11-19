// AI helpers (stretch): proposals only, owner only, validated output, graceful failure. Uses a fake AI.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HostState } from '@getit/shared';
import { prisma } from '../src/db';
import { toDrafts, toSuggestions } from '../src/lib/ai-output';
import { aiTimeout, type AiRequest } from '../src/lib/gemini';
import { hashDevice } from '../src/lib/deviceHash';
import { aiLimiter } from '../src/routes/ai';
import { setAiClient } from '../src/services/ai';
import { clearAiJobs, waitForAiJob } from '../src/services/ai-job-store';
import { launchActivity } from '../src/services/activities';
import { askQuestion } from '../src/services/questions';
import { generate, newDeviceId, newInstructor, newSession, resetDb } from './helpers';

beforeEach(async () => {
  await resetDb();
  aiLimiter.reset();
  clearAiJobs();
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
    // Runs in the background (202); the suggestions wait in the host snapshot until reviewed.
    const res = await agent.post(`/api/sessions/${s.code}/ai/group`);
    expect(res.status).toBe(202);
    expect(res.body.job).toMatchObject({ status: 'running', suggestions: [] });
    await waitForAiJob(s.id);
    const host = (await agent.get(`/api/sessions/${s.code}/host`)).body as HostState;
    expect(host.aiGroup).toMatchObject({ status: 'done' });
    const qs = await prisma.question.findMany({ where: { sessionId: s.id }, orderBy: { createdAt: 'asc' } });
    const { suggestions } = host.aiGroup!;
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
    // Applied or closed: dismissed, so no pop-up after a reload.
    expect((await agent.post(`/api/sessions/${s.code}/ai/group/dismiss`)).status).toBe(204);
    expect(((await agent.get(`/api/sessions/${s.code}/host`)).body as HostState).aiGroup).toBeNull();
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
    // Answers at once (202); the job runs in the background and saves each valid draft as an AI draft.
    expect(res.status).toBe(202);
    expect(res.body.job).toMatchObject({ status: 'running', expected: 5, received: 0 });
    expect(Object.keys(res.body.job as object).sort()).toEqual([
      'error',
      'expected',
      'finishedAt',
      'received',
      'startedAt',
      'status',
    ]);
    expect(res.job).toMatchObject({ status: 'done', expected: 5, received: 2 });
    expect(res.job!.error).toMatch(/2 of 5 drafts/);
    expect(res.drafts.map((d) => [d.prompt, d.status, d.aiDraft])).toEqual([
      ['What does the slope b measure?', 'DRAFT', true],
      ['Correlation implies causation.', 'DRAFT', true],
    ]);
    // An AI draft can't be launched until it's confirmed (or edited); then it runs like any activity.
    const [mcq, tf] = res.drafts;
    await expect(launchActivity(s.id, mcq!.id)).rejects.toMatchObject({ code: 'AI_DRAFT' });
    expect((await agent.post(`/api/activities/${mcq!.id}/confirm`)).body).toEqual({ confirmed: 1 });
    await expect(launchActivity(s.id, mcq!.id)).resolves.toBeTruthy();
    const confirmAll = await agent.post(`/api/sessions/${s.code}/activities/confirm-ai`);
    expect(confirmAll.body).toEqual({ confirmed: 1 });
    expect((await prisma.activity.findUniqueOrThrow({ where: { id: tf!.id } })).aiDraft).toBe(false);
  });

  it('generate: an AI failure or timeout is a readable error, never a crash', async () => {
    const { agent, s } = await withQuestions([]);
    setAiClient(async () => {
      throw aiTimeout();
    });
    const slow = await generate(agent, s.code, { text: SLIDES });
    expect(slow.job).toMatchObject({ status: 'failed' });
    expect(slow.error).toMatch(/took too long.*carry on by hand/);

    setAiClient(async () => ({ questions: 'nonsense' }));
    const junk = await generate(agent, s.code, { text: SLIDES });
    expect(junk.job).toMatchObject({ status: 'failed' });
    expect(junk.error).toMatch(/couldn't help/);
    expect(junk.drafts).toEqual([]);
  });

  it('rate limit: 20 AI requests per instructor per 10 minutes', async () => {
    const { agent, s } = await withQuestions([]);
    setAiClient(async () => ({
      questions: [
        { kind: 'TRUE_FALSE', prompt: 'r is between −1 and 1.', correctTrue: true, explanation: 'Yes.' },
      ],
    }));
    for (let i = 0; i < 20; i++) expect((await generate(agent, s.code, { text: SLIDES })).status).toBe(202);
    expect((await generate(agent, s.code, { text: SLIDES })).status).toBe(429);
  });

  it('one generation at a time per lecture; ended lectures refuse', async () => {
    const { agent, s } = await withQuestions([]);
    const waiting: (() => void)[] = [];
    setAiClient(() => new Promise((r) => waiting.push(() => r({ questions: [] }))));
    expect((await agent.post(`/api/sessions/${s.code}/ai/generate`).send({ text: SLIDES })).status).toBe(202);
    const second = await agent.post(`/api/sessions/${s.code}/ai/generate`).send({ text: SLIDES });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('AI_JOB_RUNNING');
    waiting.forEach((release) => release());
    await waitForAiJob(s.id);
    await agent.post(`/api/sessions/${s.code}/end`);
    expect((await agent.post(`/api/sessions/${s.code}/ai/generate`).send({ text: SLIDES })).status).toBe(409);
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

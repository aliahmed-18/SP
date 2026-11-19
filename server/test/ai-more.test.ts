// AI helpers, part 2: Explain drafts + note, Take-away key points, sorting Explain answers. Fake AI.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AiKeyPointsResult, AiSortResult } from '@getit/shared';
import { prisma } from '../src/db';
import { toAnswerGroups, toKeyPoints } from '../src/lib/ai-output';
import type { AiRequest } from '../src/lib/gemini';
import { hashDevice } from '../src/lib/deviceHash';
import { aiLimiter } from '../src/routes/ai';
import { setAiClient } from '../src/services/ai';
import { clearAiJobs } from '../src/services/ai-job-store';
import { generate, newDeviceId, newInstructor, newSession, resetDb } from './helpers';

beforeEach(async () => {
  await resetDb();
  aiLimiter.reset();
  clearAiJobs();
});
afterEach(() => setAiClient(null));
afterAll(() => prisma.$disconnect());

const SLIDES =
  'The slope b = Sxy / Sxx is the change in y for each one-unit increase in x. The correlation r lies ' +
  'between −1 and 1 and measures the strength of a linear relationship. Correlation does not imply causation.';

describe('AI helpers, part 2', () => {
  it('generate: Explain drafts + the lecturer note reach the prompt; drafts are accepted as-is', async () => {
    const { agent } = await newInstructor();
    const s = await newSession(agent);
    let seen: AiRequest | undefined;
    setAiClient(async (req) => {
      seen = req;
      return {
        questions: [
          {
            kind: 'EXPLAIN',
            prompt: "In one sentence: what does b tell you that r doesn't?",
            explanation: 'b is the change in y per unit of x.',
          },
          { kind: 'TRUE_FALSE', prompt: 'r can be 2.', correctTrue: false, explanation: 'No.' }, // not asked for
        ],
      };
    });
    const res = await generate(agent, s.code, {
      text: SLIDES,
      count: 1,
      kinds: ['EXPLAIN'],
      note: 'Focus on the slope',
    });
    expect(res.status).toBe(202);
    expect(res.drafts.map((d) => [d.type, d.prompt, d.modelAnswer, d.aiDraft])).toEqual([
      [
        'EXPLAIN',
        "In one sentence: what does b tell you that r doesn't?",
        'b is the change in y per unit of x.',
        true,
      ],
    ]);
    expect(seen!.prompt).toContain('The lecturer asks: Focus on the slope');
  });

  it('key points: built from what happened in class, cleaned, nothing saved', async () => {
    const { agent } = await newInstructor();
    const s = await newSession(agent);
    const empty = await agent.post(`/api/sessions/${s.code}/ai/keypoints`);
    setAiClient(async () => ({ keyPoints: [] }));
    expect((await agent.post(`/api/sessions/${s.code}/ai/keypoints`)).body.error.code).toBe(
      'NOTHING_TO_SUMMARISE',
    );
    expect(empty.status).toBe(503); // AI off before the fake was set

    await agent.post(`/api/sessions/${s.code}/topics`).send({ title: 'Computing the slope' });
    let seen: AiRequest | undefined;
    setAiClient(async (req) => {
      seen = req;
      return {
        keyPoints: ['  b is the change in y per unit of x. ', 'B is the change in y per unit of x.', ''],
      };
    });
    const res = await agent.post(`/api/sessions/${s.code}/ai/keypoints`);
    expect(res.status).toBe(200);
    expect((res.body as AiKeyPointsResult).keyPoints).toEqual(['b is the change in y per unit of x.']);
    expect(seen!.prompt).toContain('Students asked about "Computing the slope"');
    expect(await prisma.takeaway.count()).toBe(0);
  });

  it('sort Explain answers: closed only, answers numbered, tags suggested, nothing tagged', async () => {
    const { agent } = await newInstructor();
    const s = await newSession(agent);
    const a = (
      await agent.post(`/api/sessions/${s.code}/activities`).send({ type: 'EXPLAIN', prompt: 'What is b?' })
    ).body as { id: string };
    setAiClient(async () => ({ groups: [] }));
    expect((await agent.post(`/api/activities/${a.id}/ai/sort`)).status).toBe(409); // still a draft

    await prisma.activity.update({ where: { id: a.id }, data: { status: 'CLOSED' } });
    const texts = ['Change in y per x', 'Rise over run', 'How strong it is', 'The strength'];
    for (const text of texts)
      await prisma.response.create({
        data: { activityId: a.id, deviceHash: hashDevice(newDeviceId()), text },
      });
    const rows = await prisma.response.findMany({
      where: { activityId: a.id },
      orderBy: { createdAt: 'asc' },
    });
    let seen: AiRequest | undefined;
    setAiClient(async (req) => {
      seen = req;
      return {
        groups: [
          { label: 'Change in y per unit x', tag: 'CORRECT', answers: [1, 2] },
          { label: 'Confuses slope with strength', tag: 'MISCONCEPTION', answers: [3, 4, 1] },
          { label: 'Bad tag', tag: 'WRONG', answers: [4] },
        ],
      };
    });
    const res = await agent.post(`/api/activities/${a.id}/ai/sort`);
    expect(res.status).toBe(200);
    expect((res.body as AiSortResult).groups).toEqual([
      { label: 'Change in y per unit x', tag: 'CORRECT', answerIds: [rows[0]!.id, rows[1]!.id] },
      { label: 'Confuses slope with strength', tag: 'MISCONCEPTION', answerIds: [rows[2]!.id, rows[3]!.id] },
    ]);
    expect(seen!.prompt).toContain('A1: Change in y per x');
    for (const r of rows) expect(seen!.prompt).not.toContain(r.deviceHash);
    expect(await prisma.response.count({ where: { activityId: a.id, tag: { not: null } } })).toBe(0);

    const other = await newInstructor('Dr. Other');
    expect((await other.agent.post(`/api/activities/${a.id}/ai/sort`)).status).toBe(404);
  });
});

describe('AI output checks, part 2 (pure)', () => {
  it('key points: max 5, no restricted words, no too-long lines', () => {
    const many = Array.from({ length: 8 }, (_, i) => `Point ${i}`);
    expect(toKeyPoints({ keyPoints: many })).toHaveLength(5);
    expect(toKeyPoints({ keyPoints: ['this is shit', 'x'.repeat(400), 'ok'] })).toEqual(['ok']);
    expect(toAnswerGroups('junk', [])).toEqual([]);
  });
});

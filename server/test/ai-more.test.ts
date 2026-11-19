// AI helpers, part 2: Explain drafts + note, Take-away key points, sorting Explain answers. Fake AI.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AiGradeResult, AiKeyPointsResult, HostState } from '@getit/shared';
import { prisma } from '../src/db';
import { toAnswerGroups, toKeyPoints } from '../src/lib/ai-output';
import type { AiRequest } from '../src/lib/gemini';
import { hashDevice } from '../src/lib/deviceHash';
import { aiLimiter } from '../src/routes/ai';
import { setAiClient } from '../src/services/ai';
import { clearAiJobs, waitForAiJob } from '../src/services/ai-job-store';
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

  it("grade with AI: closed only; tags untagged answers in one click; keeps the instructor's tags", async () => {
    const { agent } = await newInstructor();
    const s = await newSession(agent);
    const a = (
      await agent.post(`/api/sessions/${s.code}/activities`).send({ type: 'EXPLAIN', prompt: 'What is b?' })
    ).body as { id: string };
    setAiClient(async () => ({ groups: [] }));
    expect((await agent.post(`/api/activities/${a.id}/ai/grade`)).status).toBe(409); // still a draft

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
    // The instructor already tagged answer 2 by hand: the AI must not change it.
    await prisma.response.update({ where: { id: rows[1]!.id }, data: { tag: 'PARTIAL' } });
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
    const res = await agent.post(`/api/activities/${a.id}/ai/grade`);
    expect(res.status).toBe(200);
    const body = res.body as AiGradeResult;
    expect(body).toMatchObject({
      graded: 3,
      counts: { CORRECT: 1, PARTIAL: 0, MISCONCEPTION: 2 },
      groups: [
        { label: 'Change in y per unit x', tag: 'CORRECT', count: 2 },
        { label: 'Confuses slope with strength', tag: 'MISCONCEPTION', count: 2 },
      ],
    });
    expect(body.changedIds.sort()).toEqual([rows[0]!.id, rows[2]!.id, rows[3]!.id].sort());
    const after = await prisma.response.findMany({
      where: { activityId: a.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(after.map((r) => r.tag)).toEqual(['CORRECT', 'PARTIAL', 'MISCONCEPTION', 'MISCONCEPTION']);
    expect(seen!.prompt).toContain('A1: Change in y per x');
    for (const r of rows) expect(seen!.prompt).not.toContain(r.deviceHash);

    const other = await newInstructor('Dr. Other');
    expect((await other.agent.post(`/api/activities/${a.id}/ai/grade`)).status).toBe(404);
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

describe('grade all written answers (background)', () => {
  it('grades every closed Explain with untagged answers, one after another; Undo ids returned', async () => {
    const { agent } = await newInstructor();
    const s = await newSession(agent);
    const make = async (prompt: string, texts: string[]) => {
      const a = (await agent.post(`/api/sessions/${s.code}/activities`).send({ type: 'EXPLAIN', prompt }))
        .body as {
        id: string;
      };
      await prisma.activity.update({ where: { id: a.id }, data: { status: 'CLOSED' } });
      for (const text of texts)
        await prisma.response.create({
          data: { activityId: a.id, deviceHash: hashDevice(newDeviceId()), text },
        });
      return a.id;
    };
    await make('What is b?', ['Change in y per x', 'How strong it is']);
    await make('What is r?', ['Strength of a linear relationship']);
    setAiClient(null);
    setAiClient(async (req) => {
      const n = (/<answers>\n([\s\S]*?)\n<\/answers>/.exec(req.prompt)?.[1] ?? '').split('\n').length;
      return {
        groups: [{ label: 'Fine', tag: 'CORRECT', answers: Array.from({ length: n }, (_, i) => i + 1) }],
      };
    });
    const res = await agent.post(`/api/sessions/${s.code}/ai/grade-all`);
    expect(res.status).toBe(202);
    expect(res.body.job).toMatchObject({ status: 'running', activities: 2, done: 0 });
    await waitForAiJob(s.id);
    const host = (await agent.get(`/api/sessions/${s.code}/host`)).body as HostState;
    expect(host.aiGrade).toMatchObject({ status: 'done', activities: 2, done: 2, graded: 3 });
    expect(host.aiGrade!.changedIds).toHaveLength(3);
    expect(await prisma.response.count({ where: { tag: 'CORRECT' } })).toBe(3);
    // Nothing left: a second click says so at once.
    const again = await agent.post(`/api/sessions/${s.code}/ai/grade-all`);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('NOTHING_TO_GRADE');
  });
});

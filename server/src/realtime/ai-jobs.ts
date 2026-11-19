import type { AiDraft, AiGradeJob, AiGroupJob, AiJob } from '@getit/shared';
import { prisma } from '../db';
import { HttpError } from '../lib/errors';
import { createExplain, createQuickCheck } from '../services/activities';
import { gradeExplainAnswers, streamDrafts, suggestTopics } from '../services/ai';
import { isRunning, jobFor, putJob } from '../services/ai-job-store';
import { emitHostSnapshot, emitPresentSnapshot, safeEmit } from './broadcast';

// Background AI work: each starter answers at once; the host page follows progress through its live
// snapshot (HostState.aiJob / aiGroup / aiGrade). The instructor can close dialogs, present or reload.

type Input = Parameters<typeof streamDrafts>[0];
const now = () => new Date().toISOString();
const reason = (err: unknown) => {
  if (!(err instanceof HttpError)) console.error('[getit] AI job failed', err);
  return err instanceof HttpError
    ? err.message
    : "The AI couldn't help this time. Try again, or carry on by hand.";
};

/**
 * Generation: each draft is saved as an activity marked "AI draft" the moment it arrives, and the host
 * page updates live. AI drafts can't be launched until confirmed.
 */
export function startAiJob(sessionId: string, input: Input): AiJob {
  if (isRunning('generate', sessionId))
    throw new HttpError(409, 'AI_JOB_RUNNING', 'Drafts are already being prepared for this lecture.');
  const job: AiJob = {
    status: 'running',
    expected: input.count,
    received: 0,
    startedAt: now(),
    finishedAt: null,
    error: null,
  };
  putJob('generate', sessionId, job, runGenerate(sessionId, input, job));
  safeEmit(emitHostSnapshot(sessionId));
  return jobFor('generate', sessionId)!;
}

async function save(sessionId: string, d: AiDraft) {
  if (d.type === 'EXPLAIN') await createExplain(sessionId, d, true);
  else await createQuickCheck(sessionId, d, true);
}

async function runGenerate(sessionId: string, input: Input, job: AiJob) {
  await Promise.resolve(); // let the starter store the job first
  try {
    await streamDrafts(input, async (drafts) => {
      for (const d of drafts) {
        await save(sessionId, d);
        job.received++;
      }
      safeEmit(emitHostSnapshot(sessionId));
      safeEmit(emitPresentSnapshot(sessionId));
    });
    job.status = 'done';
    if (job.received < job.expected)
      job.error = `${job.received} of ${job.expected} drafts could be written. You can generate more.`;
  } catch (err) {
    job.status = job.received > 0 ? 'done' : 'failed';
    job.error = reason(err);
  }
  job.finishedAt = now();
  safeEmit(emitHostSnapshot(sessionId));
}

/** "Group with AI": the suggestions wait in the job until the instructor reviews (pop-up) or dismisses them. */
export function startGroupJob(sessionId: string): AiGroupJob {
  if (isRunning('group', sessionId))
    throw new HttpError(409, 'AI_JOB_RUNNING', 'Questions are already being grouped.');
  const job: AiGroupJob = {
    status: 'running',
    startedAt: now(),
    finishedAt: null,
    error: null,
    suggestions: [],
  };
  putJob('group', sessionId, job, runGroup(sessionId, job));
  safeEmit(emitHostSnapshot(sessionId));
  return jobFor('group', sessionId)!;
}

async function runGroup(sessionId: string, job: AiGroupJob) {
  await Promise.resolve();
  try {
    job.suggestions = (await suggestTopics(sessionId)).suggestions;
    job.status = 'done';
  } catch (err) {
    job.status = 'failed';
    job.error = reason(err);
  }
  job.finishedAt = now();
  safeEmit(emitHostSnapshot(sessionId));
}

/** "Grade all written answers": every closed Explain with untagged answers, one after another. */
export async function startGradeJob(sessionId: string): Promise<AiGradeJob> {
  if (isRunning('grade', sessionId))
    throw new HttpError(409, 'AI_JOB_RUNNING', 'Written answers are already being graded.');
  const activities = await prisma.activity.findMany({
    where: {
      sessionId,
      type: 'EXPLAIN',
      status: { in: ['CLOSED', 'REVEALED'] },
      responses: { some: { tag: null, text: { not: null } } },
    },
    orderBy: { position: 'asc' },
  });
  if (activities.length === 0)
    throw new HttpError(409, 'NOTHING_TO_GRADE', 'Every written answer already has a tag.');
  const job: AiGradeJob = {
    status: 'running',
    startedAt: now(),
    finishedAt: null,
    error: null,
    activities: activities.length,
    done: 0,
    graded: 0,
    counts: { CORRECT: 0, PARTIAL: 0, MISCONCEPTION: 0 },
    changedIds: [],
  };
  putJob('grade', sessionId, job, runGrade(sessionId, activities, job));
  safeEmit(emitHostSnapshot(sessionId));
  return jobFor('grade', sessionId)!;
}

async function runGrade(
  sessionId: string,
  activities: Parameters<typeof gradeExplainAnswers>[0][],
  job: AiGradeJob,
) {
  await Promise.resolve();
  let failures = 0;
  for (const a of activities) {
    try {
      const r = await gradeExplainAnswers(a);
      job.graded += r.graded;
      job.changedIds.push(...r.changedIds);
      for (const t of ['CORRECT', 'PARTIAL', 'MISCONCEPTION'] as const) job.counts[t] += r.counts[t];
    } catch (err) {
      failures++;
      job.error = reason(err);
    }
    job.done++;
    safeEmit(emitHostSnapshot(sessionId));
  }
  job.status = failures === activities.length ? 'failed' : 'done';
  if (failures && job.status === 'done')
    job.error = `${failures} of ${activities.length} activities couldn't be graded: ${job.error}`;
  job.finishedAt = now();
  safeEmit(emitHostSnapshot(sessionId));
}

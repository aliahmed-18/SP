import type { AiDraft, AiJob } from '@getit/shared';
import { HttpError } from '../lib/errors';
import { createExplain, createQuickCheck } from '../services/activities';
import { streamDrafts } from '../services/ai';
import { aiJobFor, getAiJob, isAiJobRunning, putAiJob } from '../services/ai-job-store';
import { emitHostSnapshot, emitPresentSnapshot, safeEmit } from './broadcast';

type Input = Parameters<typeof streamDrafts>[0];

/**
 * Start AI generation in the background and return at once. Each draft is saved as an activity marked
 * "AI draft" the moment it arrives, and the host page updates live — the instructor can close the
 * dialog, present, or refresh the page; nothing is lost. AI drafts can't be launched until confirmed.
 */
export function startAiJob(sessionId: string, input: Input): AiJob {
  if (isAiJobRunning(sessionId))
    throw new HttpError(409, 'AI_JOB_RUNNING', 'Drafts are already being prepared for this lecture.');
  const job: AiJob = {
    status: 'running',
    expected: input.count,
    received: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
  };
  const done = run(sessionId, input, job);
  putAiJob(sessionId, Object.assign(job, { done }));
  safeEmit(emitHostSnapshot(sessionId));
  return aiJobFor(sessionId)!; // the public fields only (no internal promise)
}

async function save(sessionId: string, d: AiDraft) {
  if (d.type === 'EXPLAIN') await createExplain(sessionId, d, true);
  else await createQuickCheck(sessionId, d, true);
}

async function run(sessionId: string, input: Input, job: AiJob) {
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
    job.error =
      err instanceof HttpError
        ? err.message
        : "The AI couldn't help this time. Try again, or carry on by hand.";
    if (!(err instanceof HttpError)) console.error('[getit] AI job failed', err);
  }
  job.finishedAt = new Date().toISOString();
  const stored = getAiJob(sessionId);
  if (stored) Object.assign(stored, job);
  safeEmit(emitHostSnapshot(sessionId));
}

import type { AiJob } from '@getit/shared';

// One background AI generation per session, in memory (single server instance, docs/08). A server
// restart forgets a running job; the drafts already saved stay in the activities list.

type Job = AiJob & { done: Promise<void> };
const jobs = new Map<string, Job>();
/** A finished job's banner stays this long (so a refreshed page still says what happened). */
const KEEP_MS = 10 * 60 * 1000;

export function aiJobFor(sessionId: string): AiJob | null {
  const job = jobs.get(sessionId);
  if (!job) return null;
  if (job.finishedAt && Date.now() - Date.parse(job.finishedAt) > KEEP_MS) {
    jobs.delete(sessionId);
    return null;
  }
  const { done: _promise, ...pub } = job;
  return pub;
}

export function isAiJobRunning(sessionId: string) {
  return jobs.get(sessionId)?.status === 'running';
}

export function putAiJob(sessionId: string, job: Job) {
  jobs.set(sessionId, job);
}

export function getAiJob(sessionId: string): Job | undefined {
  return jobs.get(sessionId);
}

/** Tests: wait until the session's job has finished. */
export async function waitForAiJob(sessionId: string) {
  await jobs.get(sessionId)?.done;
}

export function clearAiJobs() {
  jobs.clear();
}

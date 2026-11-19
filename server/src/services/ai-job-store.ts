import type { AiGradeJob, AiGroupJob, AiJob } from '@getit/shared';

// Background AI work per session, in memory (single server instance, docs/08): one job of each kind at a
// time — generate (drafts), group (topic suggestions), grade (all written answers). A server restart
// forgets running jobs; whatever was already saved stays.

type Kinds = { generate: AiJob; group: AiGroupJob; grade: AiGradeJob };
type Kind = keyof Kinds;
type Entry = { job: Kinds[Kind]; done: Promise<void> };
const jobs = new Map<string, Entry>();
/** A finished job's banner stays this long (so a refreshed page still says what happened). */
const KEEP_MS = 10 * 60 * 1000;
const key = (kind: Kind, sessionId: string) => `${kind}:${sessionId}`;

/** The job's public state (a copy), or null. Finished jobs expire after KEEP_MS. */
export function jobFor<K extends Kind>(kind: K, sessionId: string): Kinds[K] | null {
  const e = jobs.get(key(kind, sessionId));
  if (!e) return null;
  if (e.job.finishedAt && Date.now() - Date.parse(e.job.finishedAt) > KEEP_MS) {
    jobs.delete(key(kind, sessionId));
    return null;
  }
  return structuredClone(e.job) as Kinds[K];
}

export function isRunning(kind: Kind, sessionId: string) {
  return jobs.get(key(kind, sessionId))?.job.status === 'running';
}

/** Store a job; `job` is the live object the runner keeps updating. */
export function putJob<K extends Kind>(kind: K, sessionId: string, job: Kinds[K], done: Promise<void>) {
  jobs.set(key(kind, sessionId), { job, done });
}

export function clearJob(kind: Kind, sessionId: string) {
  jobs.delete(key(kind, sessionId));
}

/** Tests: wait until every job of the session has finished. */
export async function waitForAiJob(sessionId: string) {
  await Promise.all((['generate', 'group', 'grade'] as const).map((k) => jobs.get(key(k, sessionId))?.done));
}

export function clearAiJobs() {
  jobs.clear();
}

// Generation (kept names).
export const aiJobFor = (sessionId: string) => jobFor('generate', sessionId);
export const isAiJobRunning = (sessionId: string) => isRunning('generate', sessionId);

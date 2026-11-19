// Present mode "one key moves forward" (spec D.2): open question → close (and show the answer if
// auto-reveal) → show answer → next question … → finish. Pure: the projector turns the step into a
// socket command; the server still enforces every rule.
import type { ActivityStatus, ActivityType } from './types';
import type { ProjectedItem } from './schemas';

type RunActivity = {
  id: string;
  type: ActivityType;
  status: ActivityStatus;
  position: number;
  /** Unconfirmed AI draft: never run until the instructor confirms it. */
  aiDraft?: boolean;
};
type RunState = {
  activities: RunActivity[];
  stageActivityId: string | null;
  projected: { kind: ProjectedItem['kind'] } | null;
};

export type RunStep =
  | { type: 'launch'; activityId: string; label: string }
  | { type: 'close'; activityId: string; reveal: boolean; label: string }
  | { type: 'reveal'; activityId: string; label: string }
  | { type: 'project'; item: ProjectedItem | null; label: string }
  | { type: 'undo'; activityId: string; label: string }
  | { type: 'none'; label: string };

/** Activities the projector can run, in run order. */
export function runnable<T extends RunActivity>(activities: T[]): T[] {
  return activities.filter((a) => !a.aiDraft).sort((a, b) => a.position - b.position);
}

export function nextStep(state: RunState, autoReveal: boolean): RunStep {
  const list = runnable(state.activities);
  const stage = list.find((a) => a.id === state.stageActivityId && a.status !== 'DRAFT') ?? null;
  const kind = state.projected?.kind;

  if (kind === 'wrap') return { type: 'none', label: 'All done' };
  if (kind === 'blank' || kind === 'topic' || kind === 'misconception') {
    return { type: 'project', item: null, label: 'Back' };
  }
  if (kind === 'welcome' && stage && stage.status !== 'REVEALED') {
    return { type: 'project', item: null, label: 'Back to the question' };
  }

  if (stage?.status === 'LIVE' && stage.type === 'EXPLAIN') {
    return { type: 'close', activityId: stage.id, reveal: false, label: 'Close answers' };
  }
  if (stage?.status === 'LIVE') {
    return autoReveal
      ? { type: 'close', activityId: stage.id, reveal: true, label: 'Close and show answer' }
      : { type: 'close', activityId: stage.id, reveal: false, label: 'Close question' };
  }
  // Explain has no answer to reveal: after closing it, move on.
  if (stage?.status === 'CLOSED' && stage.type === 'QUICK_CHECK') {
    return { type: 'reveal', activityId: stage.id, label: 'Show answer' };
  }

  const drafts = list.filter((a) => a.status === 'DRAFT');
  const next = (stage ? drafts.find((a) => a.position > stage.position) : undefined) ?? drafts[0];
  // (a CLOSED Explain or a REVEALED Quick Check falls through to here)
  if (next) {
    const first = list.every((a) => a.status === 'DRAFT');
    return { type: 'launch', activityId: next.id, label: first ? 'Start first activity' : 'Next question' };
  }
  return list.length
    ? { type: 'project', item: { kind: 'wrap' }, label: 'Finish' }
    : { type: 'none', label: 'No activities yet' };
}

/** ← : step back. Leave an overlay first; otherwise undo the stage activity's last step. */
export function previousStep(state: RunState): RunStep {
  const kind = state.projected?.kind;
  if (
    kind === 'wrap' ||
    kind === 'blank' ||
    kind === 'topic' ||
    kind === 'misconception' ||
    kind === 'welcome'
  ) {
    return { type: 'project', item: null, label: 'Back' };
  }
  const stage = runnable(state.activities).find(
    (a) => a.id === state.stageActivityId && a.status !== 'DRAFT',
  );
  if (!stage) return { type: 'none', label: 'Back' };
  return { type: 'undo', activityId: stage.id, label: 'Undo' };
}

/** 1-based number of the stage activity among runnable ones ("Q2 / 5"), or 0. */
export function stageNumber(state: RunState): { index: number; total: number } {
  const list = runnable(state.activities);
  return { index: list.findIndex((a) => a.id === state.stageActivityId) + 1, total: list.length };
}

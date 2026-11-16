import { describe, expect, it } from 'vitest';
import { nextStep, previousStep, stageNumber } from './runner';
import type { ActivityStatus } from './types';

const qc = (id: string, position: number, status: ActivityStatus = 'DRAFT') => ({
  id,
  type: 'QUICK_CHECK' as const,
  status,
  position,
});
const state = (
  activities: ReturnType<typeof qc>[],
  stageActivityId: string | null = null,
  projected: { kind: 'welcome' | 'blank' | 'wrap' | 'topic' } | null = null,
) => ({
  activities,
  stageActivityId,
  projected,
});

describe('present runner: one key moves forward', () => {
  it('walks open → close+reveal → next → … → finish (auto-reveal on)', () => {
    expect(nextStep(state([qc('a', 1), qc('b', 2)]), true)).toEqual({
      type: 'launch',
      activityId: 'a',
      label: 'Start first activity',
    });
    expect(nextStep(state([qc('a', 1, 'LIVE'), qc('b', 2)], 'a'), true)).toEqual({
      type: 'close',
      activityId: 'a',
      reveal: true,
      label: 'Close and show answer',
    });
    expect(nextStep(state([qc('a', 1, 'REVEALED'), qc('b', 2)], 'a'), true)).toEqual({
      type: 'launch',
      activityId: 'b',
      label: 'Next question',
    });
    expect(nextStep(state([qc('a', 1, 'REVEALED'), qc('b', 2, 'REVEALED')], 'b'), true)).toEqual({
      type: 'project',
      item: { kind: 'wrap' },
      label: 'Finish',
    });
    expect(nextStep(state([qc('a', 1, 'REVEALED')], 'a', { kind: 'wrap' }), true).type).toBe('none');
  });

  it('auto-reveal off: close (discuss the vote) → show answer', () => {
    expect(nextStep(state([qc('a', 1, 'LIVE')], 'a'), false)).toMatchObject({
      type: 'close',
      reveal: false,
      label: 'Close question',
    });
    expect(nextStep(state([qc('a', 1, 'CLOSED')], 'a'), false)).toEqual({
      type: 'reveal',
      activityId: 'a',
      label: 'Show answer',
    });
  });

  it('follows run order, skips what has been run, comes back for skipped drafts', () => {
    const list = [qc('a', 1, 'REVEALED'), qc('b', 2), qc('c', 3, 'REVEALED'), qc('d', 4)];
    expect(nextStep(state(list, 'c'), true)).toMatchObject({ type: 'launch', activityId: 'd' });
    expect(nextStep(state([qc('a', 1), qc('b', 2, 'REVEALED')], 'b'), true)).toMatchObject({
      type: 'launch',
      activityId: 'a',
    });
  });

  it('overlays first: blank / topic → back; welcome over a live question → back to it', () => {
    expect(nextStep(state([qc('a', 1, 'LIVE')], 'a', { kind: 'blank' }), true)).toMatchObject({
      type: 'project',
      item: null,
    });
    expect(nextStep(state([qc('a', 1, 'LIVE')], 'a', { kind: 'topic' }), true)).toMatchObject({
      type: 'project',
      item: null,
    });
    expect(nextStep(state([qc('a', 1, 'LIVE')], 'a', { kind: 'welcome' }), true)).toMatchObject({
      label: 'Back to the question',
    });
    expect(nextStep(state([qc('a', 1)], null, { kind: 'welcome' }), true)).toMatchObject({
      type: 'launch',
      activityId: 'a',
    });
  });

  it('Explain activities are not run yet; no activities → nothing to do', () => {
    const explain = { id: 'e', type: 'EXPLAIN' as const, status: 'DRAFT' as const, position: 1 };
    expect(nextStep({ activities: [explain], stageActivityId: null, projected: null }, true)).toEqual({
      type: 'none',
      label: 'No activities yet',
    });
  });

  it('← leaves an overlay, else undoes the stage activity', () => {
    expect(previousStep(state([qc('a', 1, 'LIVE')], 'a', { kind: 'blank' }))).toMatchObject({
      type: 'project',
      item: null,
    });
    expect(previousStep(state([qc('a', 1, 'REVEALED')], 'a'))).toEqual({
      type: 'undo',
      activityId: 'a',
      label: 'Undo',
    });
    expect(previousStep(state([qc('a', 1)]))).toMatchObject({ type: 'none' });
  });

  it('numbers the stage activity among runnable ones', () => {
    expect(stageNumber(state([qc('a', 1, 'REVEALED'), qc('b', 2, 'LIVE'), qc('c', 3)], 'b'))).toEqual({
      index: 2,
      total: 3,
    });
  });
});

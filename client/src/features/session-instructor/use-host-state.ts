import { useCallback, useRef, useState } from 'react';
import type { ActivityStats, FlagCounts, HostState } from '@getit/shared';
import { useLiveSocket } from '@/hooks/use-live-socket';
import type { GetitSocket } from '@/lib/socket';

function withFlags(s: HostState, f: FlagCounts): HostState {
  return {
    ...s,
    session: { ...s.session, flaggedCount: f.flaggedCount },
    parts: s.parts.map((p) => (p.id === f.part.id ? { ...p, flaggedCount: f.part.flaggedCount } : p)),
  };
}

/**
 * Host view state. Snapshots replace it; incremental events are applied only when their `version` is the
 * next one. Older → ignored (already in a snapshot). A gap → ask for a fresh snapshot (docs/04).
 */
export function useHostState(code: string) {
  const [state, setStateRaw] = useState<HostState | null>(null);
  /** Live "answered / joined" per activity (not versioned: counts only). */
  const [liveStats, setLiveStats] = useState<Record<string, ActivityStats>>({});
  const ref = useRef<HostState | null>(null);
  const setState = useCallback((next: HostState | null) => {
    ref.current = next;
    setStateRaw(next);
  }, []);

  const register = useCallback(
    (s: GetitSocket) => {
      const versioned = (version: number, apply: (cur: HostState) => HostState) => {
        const cur = ref.current;
        if (!cur || version <= cur.version) return;
        if (version > cur.version + 1) {
          s.emit('state:request');
          return;
        }
        setState({ ...apply(cur), version });
      };
      const patch = (apply: (cur: HostState) => HostState) => {
        if (ref.current) setState(apply(ref.current));
      };

      s.on('state:host', setState);
      s.on('session:joined', ({ joinedCount }) =>
        patch((c) => ({ ...c, session: { ...c.session, joinedCount } })),
      );
      s.on('session:ended', ({ endedAt }) =>
        patch((c) => ({ ...c, session: { ...c.session, status: 'ENDED', endedAt } })),
      );
      s.on('question:new', ({ version, question }) =>
        versioned(version, (c) => ({ ...c, questions: [question, ...c.questions] })),
      );
      s.on('question:updated', ({ version, question }) =>
        versioned(version, (c) => ({
          ...c,
          questions: c.questions.map((q) => (q.id === question.id ? question : q)),
        })),
      );
      s.on('question:removed', ({ version, questionId, ...flags }) =>
        versioned(version, (c) =>
          withFlags({ ...c, questions: c.questions.filter((q) => q.id !== questionId) }, flags),
        ),
      );
      s.on('qa:flagged', ({ version, ...flags }) => versioned(version, (c) => withFlags(c, flags)));
      s.on('topics:host', ({ version, topics }) => versioned(version, (c) => ({ ...c, topics })));
      s.on('activity:host', ({ version, activity, liveActivityId, stageActivityId }) =>
        versioned(version, (c) => ({
          ...c,
          liveActivityId,
          stageActivityId,
          activities: c.activities.map((a) => (a.id === activity.id ? activity : a)),
        })),
      );
      s.on('activity:stats', (st) => setLiveStats((prev) => ({ ...prev, [st.activityId]: st })));
    },
    [setState],
  );

  const live = useLiveSocket('host', code, register);
  return { state, setState, liveStats, ...live };
}

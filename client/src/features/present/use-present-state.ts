import { useCallback, useRef, useState } from 'react';
import type { ActivityStats, PresentState } from '@getit/shared';
import { useLiveSocket } from '@/hooks/use-live-socket';
import type { GetitSocket } from '@/lib/socket';

/** Projector state: snapshot + live patches. `clockOffset` = server time − local time (for timers). */
export function usePresentState(code: string) {
  const [state, setStateRaw] = useState<PresentState | null>(null);
  const [liveStats, setLiveStats] = useState<Record<string, ActivityStats>>({});
  const [clockOffset, setClockOffset] = useState(0);
  const ref = useRef<PresentState | null>(null);
  const setState = useCallback((next: PresentState) => {
    ref.current = next;
    setStateRaw(next);
  }, []);
  const patch = useCallback(
    (fn: (s: PresentState) => PresentState) => {
      if (ref.current) setState(fn(ref.current));
    },
    [setState],
  );

  const register = useCallback(
    (s: GetitSocket) => {
      s.on('state:present', (snap) => {
        setClockOffset(Date.parse(snap.serverTime) - Date.now());
        setState(snap);
      });
      s.on('session:joined', ({ joinedCount }) =>
        patch((c) => ({ ...c, session: { ...c.session, joinedCount } })),
      );
      s.on('session:ended', () => patch((c) => ({ ...c, session: { ...c.session, status: 'ENDED' } })));
      s.on('activity:present', ({ activity, liveActivityId, stageActivityId, serverTime }) => {
        setClockOffset(Date.parse(serverTime) - Date.now());
        patch((c) => ({
          ...c,
          liveActivityId,
          stageActivityId,
          activities: c.activities.map((a) => (a.id === activity.id ? activity : a)),
        }));
      });
      s.on('present:projected', ({ projected }) => patch((c) => ({ ...c, projected })));
      s.on('activity:stats', (st) => setLiveStats((prev) => ({ ...prev, [st.activityId]: st })));
    },
    [setState, patch],
  );

  const live = useLiveSocket('present', code, register);
  return { state, liveStats, clockOffset, ...live };
}

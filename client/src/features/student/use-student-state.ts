import { useCallback, useRef, useState } from 'react';
import type { MyResponse, StudentState, StudentTopic } from '@getit/shared';
import { useLiveSocket } from '@/hooks/use-live-socket';
import type { GetitSocket } from '@/lib/socket';

/**
 * Student state. Snapshots replace it. `topics:updated` brings the class list without `iMeToo`; this
 * phone's own Me toos come from the last snapshot plus its own acks (the server never broadcasts them).
 */
export function useStudentState(code: string) {
  const [state, setStateRaw] = useState<StudentState | null>(null);
  const ref = useRef<StudentState | null>(null);
  const mine = useRef<Set<string>>(new Set());

  const setState = useCallback((next: StudentState) => {
    ref.current = next;
    setStateRaw(next);
  }, []);

  const register = useCallback(
    (s: GetitSocket) => {
      s.on('state:student', (snap) => {
        mine.current = new Set(snap.topics.filter((t) => t.iMeToo).map((t) => t.id));
        setState(snap);
      });
      s.on('topics:updated', ({ topics }) => {
        if (!ref.current) return;
        setState({ ...ref.current, topics: topics.map((t) => ({ ...t, iMeToo: mine.current.has(t.id) })) });
      });
      s.on('activity:student', ({ activity }) => {
        const cur = ref.current;
        if (!cur) return;
        const prev = cur.liveActivity;
        // A different activity or a new round means this phone hasn't answered it yet.
        const same = prev && activity && prev.id === activity.id && prev.round === activity.round;
        setState({ ...cur, liveActivity: activity, myResponse: same ? cur.myResponse : null });
      });
      s.on('session:ended', () => {
        if (ref.current) setState({ ...ref.current, session: { ...ref.current.session, status: 'ENDED' } });
      });
    },
    [setState],
  );

  const live = useLiveSocket('student', code, register);

  /** Apply a Me too ack (or an optimistic toggle) to this phone's view. */
  const applyMeToo = useCallback(
    (topicId: string, on: boolean, meTooCount?: number) => {
      if (on) mine.current.add(topicId);
      else mine.current.delete(topicId);
      const cur = ref.current;
      if (!cur) return;
      setState({
        ...cur,
        topics: cur.topics.map((t): StudentTopic =>
          t.id === topicId
            ? { ...t, iMeToo: on, meTooCount: meTooCount ?? Math.max(0, t.meTooCount + (on ? 1 : -1)) }
            : t,
        ),
      });
    },
    [setState],
  );

  /** Store this phone's answer / confidence from the server's ack. */
  const applyMyResponse = useCallback(
    (mine: MyResponse) => {
      const cur = ref.current;
      if (cur) setState({ ...cur, myResponse: mine });
    },
    [setState],
  );

  return { state, applyMeToo, applyMyResponse, ...live };
}

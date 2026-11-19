import { useEffect, useState } from 'react';
import type { SessionListItem } from '@getit/shared';

/** When a lecture sits in the calendar: its planned time while SCHEDULED, else when it really started. */
export const lectureTime = (s: SessionListItem) =>
  new Date(s.status === 'SCHEDULED' && s.scheduledFor ? s.scheduledFor : s.startedAt);

/** A clock that ticks every 30 s (countdowns). */
export function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

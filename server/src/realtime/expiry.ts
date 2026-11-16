import { endExpiredSessions } from '../services/sessions';
import { reconcileTimers } from './timers';

/** Rule 9: end LIVE sessions after 6 h even if nobody is looking at them. */
export function startExpirySweep(intervalMs = 60_000): () => void {
  const run = () => {
    endExpiredSessions().catch((err) => console.error('[getit] expiry sweep failed', err));
    // Safety net for question timers (restart, missed timeout): re-arm / close overdue ones.
    reconcileTimers().catch((err) => console.error('[getit] timer reconcile failed', err));
  };
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

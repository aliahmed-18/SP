import { endExpiredSessions, startDueSessions } from '../services/sessions';
import { reconcileTimers } from './timers';

/**
 * Rule 9: end LIVE sessions after 6 h even if nobody is looking at them. Calendar: start planned lectures
 * whose time has come (checked every 30 s, so they start within half a minute of the time).
 */
export function startExpirySweep(intervalMs = 30_000): () => void {
  const run = () => {
    startDueSessions().catch((err) => console.error('[getit] auto-start sweep failed', err));
    endExpiredSessions().catch((err) => console.error('[getit] expiry sweep failed', err));
    // Safety net for question timers (restart, missed timeout): re-arm / close overdue ones.
    reconcileTimers().catch((err) => console.error('[getit] timer reconcile failed', err));
  };
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

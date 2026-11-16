import { endExpiredSessions } from '../services/sessions';

/** Rule 9: end LIVE sessions after 6 h even if nobody is looking at them. */
export function startExpirySweep(intervalMs = 60_000): () => void {
  const run = () => {
    endExpiredSessions().catch((err) => console.error('[getit] expiry sweep failed', err));
  };
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

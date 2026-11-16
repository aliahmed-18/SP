import { useCallback, useState } from 'react';
import { Check, CircleStop } from 'lucide-react';
import { useParams } from 'react-router';
import { normalizeJoinCode, type StudentState } from '@getit/shared';
import { LoadingState } from '@/components/brand/brand';
import { ReconnectingBanner } from '@/components/layout/ReconnectingBanner';
import { useLiveSocket } from '@/hooks/use-live-socket';
import type { GetitSocket } from '@/lib/socket';
import { InvalidSession } from './InvalidSession';
import { StudentHeader } from './StudentHeader';

/** `/s/:code` — the phone screen (shots 20–29). Phase 2: joined + ended states. */
export function StudentPage() {
  const code = normalizeJoinCode(useParams().code ?? '');
  const [state, setState] = useState<StudentState | null>(null);

  const register = useCallback((s: GetitSocket) => {
    s.on('state:student', setState);
    s.on('session:ended', () =>
      setState((prev) => (prev ? { ...prev, session: { ...prev.session, status: 'ENDED' } } : prev)),
    );
  }, []);
  const { status } = useLiveSocket('student', code, register);

  if (status === 'refused') return <InvalidSession code={code} />;
  if (!state) return <LoadingState text="Joining the lecture…" />;

  const ended = state.session.status === 'ENDED';
  return (
    <div className="min-h-dvh">
      <ReconnectingBanner status={status} />
      <StudentHeader topic={state.session.topic} />
      <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-6">
        {ended ? (
          <section
            className="fade-in flex flex-col items-center gap-3 rounded-2xl border bg-card p-8 text-center"
            aria-live="polite"
          >
            <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
              <CircleStop className="size-6" aria-hidden />
            </span>
            <h1 className="text-2xl font-semibold">The lecture has ended</h1>
            <p className="text-muted-foreground">
              {state.takeawayPublished
                ? 'Your Take-away is ready.'
                : 'The instructor is preparing your Take-away. Keep this page open or come back later.'}
            </p>
          </section>
        ) : (
          <section className="fade-in flex items-start gap-4" aria-live="polite">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-accent text-primary">
              <Check className="size-6" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold">You're in</h1>
              <p className="text-muted-foreground">
                Ask anything, any time. The instructor never sees who asked.
              </p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

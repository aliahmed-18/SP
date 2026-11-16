import { useCallback, useEffect, useState } from 'react';
import { QrCode as QrIcon, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import { normalizeJoinCode, type PresentState } from '@getit/shared';
import { LoadingState } from '@/components/brand/brand';
import { ErrorState } from '@/components/layout/ErrorState';
import { ReconnectingBanner } from '@/components/layout/ReconnectingBanner';
import { QrCode } from '@/components/QrCode';
import { joinUrl } from '@/lib/links';
import { Button } from '@/components/ui/button';
import { useLiveSocket } from '@/hooks/use-live-socket';
import type { GetitSocket } from '@/lib/socket';

/** Projector (shot 05). Phase 2: welcome screen with live joined count. Phase 5 adds running activities. */
export function PresentPage() {
  const code = normalizeJoinCode(useParams().code ?? '');
  const navigate = useNavigate();
  const [state, setState] = useState<PresentState | null>(null);

  const register = useCallback((s: GetitSocket) => {
    s.on('state:present', setState);
    s.on('session:joined', ({ joinedCount }) =>
      setState((prev) => (prev ? { ...prev, session: { ...prev.session, joinedCount } } : prev)),
    );
    s.on('session:ended', () =>
      setState((prev) => (prev ? { ...prev, session: { ...prev.session, status: 'ENDED' } } : prev)),
    );
  }, []);
  const { status } = useLiveSocket('present', code, register);

  const exit = useCallback(() => {
    // Opened by the host page with window.open → close it; otherwise go back to the host view.
    window.close();
    setTimeout(() => navigate(`/s/${code}/host`), 50);
  }, [code, navigate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && exit();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exit]);

  if (status === 'refused') {
    return (
      <ErrorState
        title="Can't open the projector view"
        body="Log in as the session's instructor and try again."
      />
    );
  }
  if (!state) return <LoadingState text="Opening the projector view…" />;

  const { session } = state;
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <ReconnectingBanner status={status} />
      <header className="flex items-center justify-end gap-3 p-4">
        <span className="flex items-center gap-2 rounded-lg border border-primary/25 bg-accent px-3 py-1.5 font-bold tracking-[0.2em] text-primary">
          <QrIcon className="size-4" aria-hidden /> {session.code}
        </span>
        <Button variant="outline" size="icon" onClick={exit} aria-label="Exit projector view (Esc)">
          <X className="size-5" />
        </Button>
      </header>

      <main className="flex flex-1 items-center justify-center px-8 pb-8">
        {session.status === 'ENDED' ? (
          <div className="run-step text-center">
            <p className="text-2xl text-muted-foreground">Thank you!</p>
            <h1 className="text-6xl font-bold">The lecture has ended</h1>
          </div>
        ) : (
          <section
            aria-labelledby="present-topic"
            className="run-step grid w-full max-w-6xl items-center gap-12 rounded-3xl border bg-card p-12 shadow-sm md:grid-cols-[1fr_auto]"
          >
            <div className="min-w-0">
              <p className="text-xl font-semibold text-primary">Topic</p>
              <h1 id="present-topic" className="mb-4 text-5xl leading-tight font-bold xl:text-6xl" dir="auto">
                {session.topic}
              </h1>
              <p className="text-2xl text-muted-foreground">Welcome! Scan to join the session</p>
              <p className="mt-6 text-xl text-muted-foreground">
                or go to {window.location.host} and enter the code
              </p>
              <p
                className="text-[7rem] leading-none font-bold tracking-[0.15em] text-primary"
                aria-label={`Join code ${session.code.split('').join(' ')}`}
              >
                {session.code}
              </p>
              <p
                className="mt-6 inline-flex items-center gap-3 rounded-full bg-accent px-5 py-2 text-2xl font-semibold text-accent-foreground"
                aria-live="polite"
              >
                <span className="size-3 rounded-full bg-primary" aria-hidden />
                <span data-testid="present-joined">{session.joinedCount}</span> Joined
              </p>
            </div>
            <QrCode
              value={joinUrl(session.code)}
              label={`QR code to join session ${session.code}`}
              className="w-[22rem]"
            />
          </section>
        )}
      </main>

      <footer className="border-t px-6 py-3 text-sm text-muted-foreground">Esc: exit</footer>
    </div>
  );
}

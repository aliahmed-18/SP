import type { PresentState } from '@getit/shared';
import { QrCode } from '@/components/QrCode';
import { joinUrl } from '@/lib/links';

/** Shot 05: topic, "Welcome! Scan to join", huge code, QR, live joined count. */
export function Welcome({ session }: { session: PresentState['session'] }) {
  return (
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
  );
}

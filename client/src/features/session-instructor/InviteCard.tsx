import { Globe, MonitorUp, QrCode as QrIcon, TriangleAlert, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { openPresentWindow } from '@/lib/links';
import { usePublicOrigin } from '@/lib/public-origin';

/** Shot 02: "Invite students" with the code, joined count, projector + QR buttons. */
export function InviteCard({
  code,
  joinedCount,
  onShowQr,
}: {
  code: string;
  joinedCount: number;
  onShowQr: () => void;
}) {
  const { origin, localOnly, tunnel } = usePublicOrigin();
  return (
    <section
      aria-labelledby="invite-title"
      className="flex flex-wrap items-center gap-4 rounded-2xl border border-primary/25 bg-accent p-5"
    >
      <div className="min-w-0 flex-1">
        <h2 id="invite-title" className="font-semibold">
          Invite students
        </h2>
        <p className="flex flex-wrap items-center gap-3">
          <span
            className="text-2xl font-bold tracking-[0.3em] text-primary"
            aria-label={`Join code ${code.split('').join(' ')}`}
            data-testid="join-code"
          >
            {code}
          </span>
          <span className="flex items-center gap-1 text-sm text-muted-foreground" aria-live="polite">
            <Users className="size-4" aria-hidden />
            <strong className="text-foreground" data-testid="joined-count">
              {joinedCount}
            </strong>{' '}
            Joined
          </span>
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => openPresentWindow(code)}
          aria-label="Open projector view"
          title="Open projector view"
        >
          <MonitorUp className="size-5" />
        </Button>
        <Button onClick={onShowQr}>
          <QrIcon /> QR
        </Button>
      </div>
      {localOnly && (
        <p
          className="flex w-full items-start gap-2 rounded-xl border border-attention/50 bg-attention/10 p-3 text-sm"
          data-testid="local-only"
        >
          <TriangleAlert
            className="mt-0.5 size-4 shrink-0 text-attention-foreground dark:text-attention"
            aria-hidden
          />
          <span>
            <strong>Phones can't open “localhost”.</strong> To let students join from their phones, run{' '}
            <code className="rounded bg-card px-1">npm run share</code> in a second terminal — the QR then
            uses a public link by itself.
          </span>
        </p>
      )}
      {tunnel && (
        <p className="flex w-full items-center gap-2 text-sm text-muted-foreground" data-testid="public-link">
          <Globe className="size-4 shrink-0" aria-hidden /> Phones join through{' '}
          <span className="font-medium break-all text-foreground">{new URL(origin).host}</span>
        </p>
      )}
    </section>
  );
}

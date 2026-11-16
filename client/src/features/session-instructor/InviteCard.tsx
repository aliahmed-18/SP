import { MonitorUp, QrCode as QrIcon, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { openPresentWindow } from '@/lib/links';

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
          aria-label="Show on projector"
          title="Show on projector"
        >
          <MonitorUp className="size-5" />
        </Button>
        <Button onClick={onShowQr}>
          <QrIcon /> QR
        </Button>
      </div>
    </section>
  );
}

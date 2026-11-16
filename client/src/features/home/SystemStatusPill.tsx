import { Spinner } from '@/components/brand/brand';
import { useSystemStatus } from '@/hooks/use-system-status';
import { cn } from '@/lib/utils';

/** Phase 1 only: proves client ↔ server ↔ socket ↔ database work end to end. */
export function SystemStatusPill() {
  const { socket, pingMs, db } = useSystemStatus();
  const ok = socket === 'connected' && db === true;
  const text =
    socket === 'connected'
      ? `Socket connected${pingMs !== null ? ` · ${pingMs} ms` : ''} · DB ${db === null ? '…' : db ? 'ok' : 'down'}`
      : socket === 'reconnecting'
        ? 'Reconnecting…'
        : 'Connecting…';
  return (
    <p
      role="status"
      data-testid="system-status"
      data-state={ok ? 'ok' : socket}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs',
        ok ? 'border-primary/30 bg-accent text-accent-foreground' : 'text-muted-foreground',
      )}
    >
      {ok ? <span className="size-2 rounded-full bg-primary" aria-hidden /> : <Spinner decorative />}
      {text}
    </p>
  );
}

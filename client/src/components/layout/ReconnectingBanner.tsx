import { Spinner } from '@/components/brand/brand';
import type { LiveStatus } from '@/hooks/use-live-socket';

/** Small banner while the live connection is down (docs/04: "Reconnecting…"). */
export function ReconnectingBanner({ status }: { status: LiveStatus }) {
  if (status !== 'reconnecting') return null;
  return (
    <div
      role="status"
      className="fade-in fixed inset-x-0 top-0 z-50 flex justify-center p-2"
      data-testid="reconnecting-banner"
    >
      <p className="flex items-center gap-2 rounded-full border bg-card px-4 py-1.5 text-sm shadow-md">
        <Spinner decorative /> Reconnecting…
      </p>
    </div>
  );
}

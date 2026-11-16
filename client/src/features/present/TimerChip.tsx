import { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';
import { ADD_TIME_SECONDS } from '@getit/shared';
import { cn } from '@/lib/utils';

/** Countdown from the server's closesAt (corrected by the clock offset). Click: +15 s. */
export function TimerChip({
  closesAt,
  clockOffset,
  onAdd,
}: {
  closesAt: string;
  clockOffset: number;
  onAdd: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil((Date.parse(closesAt) - (now + clockOffset)) / 1000));
  const label = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  return (
    <button
      type="button"
      onClick={onAdd}
      title={`Add ${ADD_TIME_SECONDS} seconds`}
      aria-label={`${label} left. Add ${ADD_TIME_SECONDS} seconds`}
      className={cn(
        'flex h-11 items-center gap-2 rounded-full bg-muted px-4 text-xl font-semibold tabular-nums',
        left <= 10 && 'bg-attention/20 text-attention-foreground dark:text-attention',
      )}
      data-testid="present-timer"
    >
      <Timer className="size-5" aria-hidden /> {label}
    </button>
  );
}

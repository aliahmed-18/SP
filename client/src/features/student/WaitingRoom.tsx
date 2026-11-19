import { useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { Wordmark } from '@/components/brand/brand';
import { fmt, untilText } from '@/lib/datetime';

/**
 * A phone that opens a planned lecture's code before it starts: the topic and the start time, with a
 * countdown. The caller polls the lecture's status and moves on by itself once it is LIVE.
 */
export function WaitingRoom({ topic, scheduledFor }: { topic: string; scheduledFor: string | null }) {
  const at = scheduledFor ? new Date(scheduledFor) : null;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <Wordmark className="h-10 w-auto" />
      <span className="grid size-16 place-items-center rounded-full bg-accent text-primary">
        <CalendarClock className="size-8" aria-hidden />
      </span>
      <div className="flex flex-col gap-2" role="status" data-testid="waiting-room">
        <p className="text-sm font-medium text-primary">The lecture hasn't started yet</p>
        <h1 className="text-2xl font-bold" dir="auto">
          {topic}
        </h1>
        {at && (
          <p className="text-lg text-muted-foreground">
            Starts {fmt.dayTime.format(at)} ·{' '}
            <strong className="text-foreground">{untilText(at, now)}</strong>
          </p>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Keep this page open — you'll join automatically when your instructor starts.
      </p>
    </main>
  );
}

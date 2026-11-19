import { CalendarClock, CalendarPlus, ListChecks, Play, Radio } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import type { CourseDto, SessionListItem } from '@getit/shared';
import { Spinner } from '@/components/brand/brand';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ApiRequestError } from '@/lib/api';
import { fmt, sameDay, untilText } from '@/lib/datetime';
import { useNow } from './lecture-time';
import { useStartPlanned } from './queries';

/** Lectures running right now — the first thing an instructor needs back to. */
export function LiveNow({ sessions }: { sessions: SessionListItem[] }) {
  if (!sessions.length) return null;
  return (
    <section
      aria-labelledby="live-title"
      className="overflow-hidden rounded-2xl border border-attention/40 bg-attention/10"
    >
      <h2
        id="live-title"
        className="flex items-center gap-2 px-4 pt-3 text-sm font-semibold text-attention-foreground dark:text-attention"
      >
        <span className="relative flex size-2.5" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-attention opacity-60 motion-reduce:hidden" />
          <span className="relative inline-flex size-2.5 rounded-full bg-attention" />
        </span>
        Live now
      </h2>
      <ul className="flex flex-col p-1.5">
        {sessions.map((s) => (
          <li key={s.id}>
            <Link
              to={`/s/${s.code}/host`}
              className="flex min-h-11 items-center gap-3 rounded-xl px-2.5 py-2 hover:bg-attention/15"
            >
              <Radio className="size-4 shrink-0 text-attention-foreground dark:text-attention" aria-hidden />
              <span className="min-w-0 flex-1 truncate font-medium" dir="auto">
                {s.topic}
              </span>
              <span className="hidden text-xs text-muted-foreground sm:inline">
                since {fmt.time.format(new Date(s.startedAt))}
              </span>
              <span className="font-mono text-sm font-semibold tracking-widest">{s.code}</span>
              <span className="text-sm font-medium text-primary">Open →</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The next planned lecture, big: when, what is ready, and the two actions (prepare / start). */
export function NextUp({
  session,
  courses,
  onPlan,
}: {
  session: SessionListItem | undefined;
  courses: CourseDto[];
  onPlan: () => void;
}) {
  const navigate = useNavigate();
  const start = useStartPlanned();
  const now = useNow();

  if (!session?.scheduledFor) {
    return (
      <section className="flex flex-col items-start gap-3 rounded-2xl border border-dashed bg-card/50 p-5 sm:flex-row sm:items-center">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-primary">
          <CalendarPlus className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">No lecture planned</h2>
          <p className="text-sm text-muted-foreground">
            Plan the next one: its code is ready to put on your slides, and you can prepare the activities
            ahead.
          </p>
        </div>
        <Button variant="outline" onClick={onPlan}>
          <CalendarPlus /> Plan a lecture
        </Button>
      </section>
    );
  }

  const at = new Date(session.scheduledFor);
  const course = courses.find((c) => c.id === session.courseId)?.name;
  const soon = at.getTime() - now.getTime() < 60 * 60_000;
  return (
    <section
      aria-labelledby="next-title"
      className="relative overflow-hidden rounded-2xl border border-primary/25 bg-card p-5 shadow-xs sm:p-6"
      data-testid="next-up"
    >
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-accent/70 to-transparent"
        aria-hidden
      />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold tracking-wide text-primary uppercase">
            <CalendarClock className="size-4" aria-hidden /> Next up
            <Badge variant={soon ? 'attention' : 'accent'} className="normal-case">
              {untilText(at, now)}
            </Badge>
          </p>
          <h2 id="next-title" className="truncate text-2xl font-semibold" dir="auto">
            {session.topic}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {sameDay(at, now) ? `Today, ${fmt.time.format(at)}` : fmt.dayTime.format(at)}
            {course ? ` · ${course}` : ''} · {session.activities}{' '}
            {session.activities === 1 ? 'activity' : 'activities'} ready ·{' '}
            {session.autoStart ? 'starts by itself' : 'starts when you press Start'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <div className="text-center">
            <p className="text-[11px] font-medium text-muted-foreground uppercase">Join code</p>
            <p className="font-mono text-2xl font-bold tracking-[0.2em] text-primary">{session.code}</p>
          </div>
        </div>
      </div>
      <div className="relative mt-5 flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link to={`/s/${session.code}/host`}>
            <ListChecks /> Prepare
          </Link>
        </Button>
        <Button
          disabled={start.isPending}
          onClick={() =>
            start.mutate(session.code, {
              onSuccess: () => navigate(`/s/${session.code}/host`),
              onError: (err) =>
                toast.error(err instanceof ApiRequestError ? err.message : "Couldn't start the lecture."),
            })
          }
        >
          {start.isPending ? <Spinner decorative /> : <Play />} Start now
        </Button>
      </div>
    </section>
  );
}

import { useEffect, useState } from 'react';
import { CalendarClock, ListChecks, Play } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import type { CourseDto, SessionListItem } from '@getit/shared';
import { Spinner } from '@/components/brand/brand';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ApiRequestError } from '@/lib/api';
import { fmt, untilText } from '@/lib/datetime';
import { useStartPlanned } from './queries';

/** Next planned lectures, soonest first: countdown, prepare, or start early. */
export function UpcomingList({ sessions, courses }: { sessions: SessionListItem[]; courses: CourseDto[] }) {
  const navigate = useNavigate();
  const start = useStartPlanned();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const upcoming = sessions
    .filter((s) => s.status === 'SCHEDULED' && s.scheduledFor)
    .sort((a, b) => Date.parse(a.scheduledFor!) - Date.parse(b.scheduledFor!))
    .slice(0, 5);
  const courseName = new Map(courses.map((c) => [c.id, c.name]));

  return (
    <section
      aria-labelledby="upcoming-title"
      className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:p-5"
    >
      <h2 id="upcoming-title" className="flex items-center gap-2 text-lg font-semibold">
        <CalendarClock className="size-5 text-primary" aria-hidden /> Upcoming
      </h2>
      {upcoming.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No lectures planned. Pick a day in the calendar, or use <strong>Plan a lecture</strong>, to prepare
          one in advance.
        </p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="upcoming">
          {upcoming.map((s) => {
            const at = new Date(s.scheduledFor!);
            return (
              <li key={s.id} className="rounded-xl border p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{fmt.dayTime.format(at)}</span>
                  <span>· {untilText(at, now)}</span>
                  <Badge variant={s.autoStart ? 'accent' : 'secondary'} className="ml-auto">
                    {s.autoStart ? 'Starts by itself' : 'Starts when you press Start'}
                  </Badge>
                </div>
                <p className="mt-1 truncate font-medium" dir="auto">
                  {s.topic}
                </p>
                <p className="text-xs text-muted-foreground">
                  {s.courseId ? courseName.get(s.courseId) : 'No course'} · Code {s.code} · {s.activities}{' '}
                  {s.activities === 1 ? 'activity' : 'activities'} ready
                </p>
                <div className="mt-2 flex gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/s/${s.code}/host`}>
                      <ListChecks /> Prepare
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    disabled={start.isPending}
                    onClick={() =>
                      start.mutate(s.code, {
                        onSuccess: () => navigate(`/s/${s.code}/host`),
                        onError: (err) =>
                          toast.error(
                            err instanceof ApiRequestError ? err.message : "Couldn't start the lecture.",
                          ),
                      })
                    }
                  >
                    {start.isPending && start.variables === s.code ? <Spinner decorative /> : <Play />} Start
                    now
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

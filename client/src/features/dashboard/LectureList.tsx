import { useMemo, useState } from 'react';
import { ChevronRight, MessageCircleQuestion, Search, Users } from 'lucide-react';
import { Link } from 'react-router';
import type { CourseDto, SessionListItem } from '@getit/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { dayKey, fmt, untilText } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import { lectureTime, useNow } from './lecture-time';

const PAGE = 15;
type Tab = 'upcoming' | 'past';

function dayHeading(d: Date, now: Date) {
  const diff = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      86_400_000,
  );
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const label = fmt.longDay.format(d);
  return d.getFullYear() === now.getFullYear() ? label : `${label} ${d.getFullYear()}`;
}

/**
 * Every lecture of the chosen course, as an agenda: Upcoming (planned, soonest first; live ones are in Live now) or Past
 * (newest first), grouped by day, searchable, 15 at a time.
 */
export function LectureList({
  sessions,
  courses,
  showCourse,
  empty,
}: {
  sessions: SessionListItem[];
  courses: CourseDto[];
  showCourse: boolean;
  empty: React.ReactNode;
}) {
  const now = useNow();
  const upcoming = useMemo(
    () =>
      sessions
        .filter((s) => s.status === 'SCHEDULED')
        .sort((a, b) => lectureTime(a).getTime() - lectureTime(b).getTime()),
    [sessions],
  );
  const past = useMemo(
    () =>
      sessions
        .filter((s) => s.status === 'ENDED')
        .sort((a, b) => lectureTime(b).getTime() - lectureTime(a).getTime()),
    [sessions],
  );
  const [chosen, setChosen] = useState<Tab>();
  const tab: Tab = chosen ?? (upcoming.length ? 'upcoming' : 'past');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const courseName = useMemo(() => new Map(courses.map((c) => [c.id, c.name])), [courses]);

  const q = query.trim().toLowerCase();
  const all = (tab === 'upcoming' ? upcoming : past).filter(
    (s) => !q || s.topic.toLowerCase().includes(q) || s.code.toLowerCase().includes(q),
  );
  const shown = all.slice(0, limit);
  const groups: { key: string; label: string; items: SessionListItem[] }[] = [];
  for (const s of shown) {
    const d = lectureTime(s);
    const key = dayKey(d);
    const last = groups.at(-1);
    if (last?.key === key) last.items.push(s);
    else groups.push({ key, label: dayHeading(d, now), items: [s] });
  }

  if (!sessions.length) return <>{empty}</>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div role="tablist" aria-label="Which lectures" className="inline-flex h-11 rounded-xl bg-muted p-1">
          {(
            [
              ['upcoming', 'Upcoming', upcoming.length],
              ['past', 'Past', past.length],
            ] as const
          ).map(([id, label, n]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => {
                setChosen(id);
                setLimit(PAGE);
              }}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-medium transition-colors sm:flex-none',
                tab === id
                  ? 'bg-background text-foreground shadow-sm dark:bg-input/40'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
              <span
                className={cn(
                  'rounded-full px-1.5 text-xs tabular-nums',
                  tab === id ? 'bg-accent text-primary' : 'bg-background/60',
                )}
              >
                {n}
              </span>
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto sm:w-64">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
            placeholder="Search topic or code"
            aria-label="Search lectures"
            className="pl-9"
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {q
            ? `No lectures match “${query.trim()}”.`
            : tab === 'upcoming'
              ? 'Nothing planned. Plan the next lecture to prepare it ahead.'
              : 'No past lectures yet.'}
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          <ul
            className="flex flex-col gap-5"
            aria-label="Sessions"
            data-testid={tab === 'upcoming' ? 'upcoming' : 'past'}
          >
            {groups.map((g) => (
              <li key={g.key} className="flex flex-col gap-1.5">
                <h3 className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {g.label}
                </h3>
                <ul className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-xs">
                  {g.items.map((s) => (
                    <li key={s.id} className="border-b last:border-b-0">
                      <LectureRow
                        s={s}
                        now={now}
                        course={
                          showCourse ? (s.courseId ? courseName.get(s.courseId) : undefined) : undefined
                        }
                      />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {all.length > shown.length && (
            <Button variant="outline" className="self-center" onClick={() => setLimit((l) => l + PAGE)}>
              Show more ({all.length - shown.length} left)
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function LectureRow({ s, now, course }: { s: SessionListItem; now: Date; course?: string }) {
  const at = lectureTime(s);
  return (
    <Link
      to={`/s/${s.code}/host`}
      className="group flex min-h-16 items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/50 sm:gap-4 sm:px-4"
    >
      <span className="w-12 shrink-0 text-sm font-semibold tabular-nums">{fmt.time.format(at)}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium" dir="auto">
          {s.topic}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {s.status === 'LIVE' ? (
            <Badge variant="attention" className="h-5">
              <span className="size-1.5 rounded-full bg-attention" aria-hidden /> Live · {s.code}
            </Badge>
          ) : s.status === 'SCHEDULED' ? (
            <>
              <Badge variant="accent" className="h-5">
                Planned · {s.code}
              </Badge>
              <span className="whitespace-nowrap">
                {untilText(at, now)} · {s.activities} {s.activities === 1 ? 'activity' : 'activities'}
              </span>
            </>
          ) : (
            <Badge variant="secondary" className="h-5">
              Ended
            </Badge>
          )}
          {course && <span className="truncate">· {course}</span>}
        </span>
      </span>
      {s.status !== 'SCHEDULED' && (
        <span className="hidden items-center gap-4 text-sm text-muted-foreground sm:flex">
          <span className="flex items-center gap-1.5" title="Joined">
            <Users className="size-4" aria-hidden /> {s.joined} <span className="sr-only">joined</span>
          </span>
          <span className="flex items-center gap-1.5" title="Questions">
            <MessageCircleQuestion className="size-4" aria-hidden /> {s.questions}
            <span className="sr-only">questions</span>
          </span>
        </span>
      )}
      <ChevronRight
        className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
        aria-hidden
      />
    </Link>
  );
}

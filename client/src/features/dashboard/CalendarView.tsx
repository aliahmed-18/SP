import { useMemo, useState } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import type { SessionListItem } from '@getit/shared';
import { Button } from '@/components/ui/button';
import { dayKey, fmt, sameDay } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import { lectureTime } from './lecture-time';

const CHIP = {
  SCHEDULED: 'bg-primary/15 text-primary hover:bg-primary/25',
  LIVE: 'bg-attention/20 text-attention-foreground hover:bg-attention/30 dark:text-attention',
  ENDED: 'bg-muted text-muted-foreground hover:bg-muted/70',
} as const;
const DOT = { SCHEDULED: 'bg-primary', LIVE: 'bg-attention', ENDED: 'bg-muted-foreground/50' } as const;
const STATUS_LABEL = { SCHEDULED: 'Planned', LIVE: 'Live', ENDED: 'Ended' } as const;

/** The 6 weeks (Monday first) that show a month. */
function monthGrid(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // Monday = 0
  const start = new Date(first);
  start.setDate(first.getDate() - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

/**
 * Dashboard calendar: every lecture (planned, live, past) on a month grid. Pick a day to see its
 * lectures and plan a new one there; planned lectures open their page to prepare them.
 */
export function CalendarView({
  sessions,
  onPlan,
}: {
  sessions: SessionListItem[];
  onPlan: (day: Date) => void;
}) {
  const today = new Date();
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<Date>(today);
  const days = useMemo(() => monthGrid(month), [month]);
  const byDay = useMemo(() => {
    const m = new Map<string, SessionListItem[]>();
    for (const s of sessions) {
      const k = dayKey(lectureTime(s));
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    for (const list of m.values()) list.sort((a, b) => lectureTime(a).getTime() - lectureTime(b).getTime());
    return m;
  }, [sessions]);
  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  const selectedList = byDay.get(dayKey(selected)) ?? [];
  const selectedPast = dayKey(selected) < dayKey(today);

  return (
    <section
      aria-labelledby="calendar-title"
      className="rounded-2xl border bg-card p-4 sm:p-5"
      data-testid="calendar"
    >
      <div className="mb-4 flex items-center gap-2">
        <h2 id="calendar-title" className="min-w-0 flex-1 text-lg font-semibold" aria-live="polite">
          {fmt.month.format(month)}
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
            setSelected(today);
          }}
        >
          Today
        </Button>
        <Button variant="ghost" size="icon" onClick={() => shift(-1)} aria-label="Previous month">
          <ChevronLeft className="size-5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => shift(1)} aria-label="Next month">
          <ChevronRight className="size-5" />
        </Button>
      </div>

      <div
        className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground"
        aria-hidden
      >
        {days.slice(0, 7).map((d) => (
          <span key={d.toISOString()} className="pb-1">
            {fmt.weekday.format(d)}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1" role="grid" aria-label={fmt.month.format(month)}>
        {days.map((d) => {
          const list = byDay.get(dayKey(d)) ?? [];
          const inMonth = d.getMonth() === month.getMonth();
          const isToday = sameDay(d, today);
          const isSelected = sameDay(d, selected);
          return (
            <div
              key={d.toISOString()}
              role="gridcell"
              aria-selected={isSelected}
              className={cn(
                'relative flex min-h-12 flex-col rounded-lg border text-left transition-colors sm:min-h-24',
                inMonth ? 'bg-background' : 'bg-transparent opacity-50',
                isSelected ? 'border-primary ring-1 ring-primary' : 'border-transparent hover:border-border',
              )}
            >
              <button
                type="button"
                onClick={() => setSelected(d)}
                className="absolute inset-0 rounded-lg"
                aria-label={`${fmt.longDay.format(d)}${list.length ? `, ${list.length} ${list.length === 1 ? 'lecture' : 'lectures'}` : ''}`}
                data-testid={`day-${dayKey(d)}`}
              />
              <span
                className={cn(
                  'pointer-events-none m-1 grid size-7 place-items-center rounded-full text-sm',
                  isToday && 'bg-primary font-semibold text-primary-foreground',
                )}
              >
                {d.getDate()}
              </span>
              {/* Phones: a dot per lecture. Wider: the time and topic, each a link to the lecture. */}
              <span
                className="pointer-events-none flex flex-wrap justify-center gap-0.5 px-1 pb-1 sm:hidden"
                aria-hidden
              >
                {list.slice(0, 3).map((s) => (
                  <span key={s.id} className={cn('size-1.5 rounded-full', DOT[s.status])} />
                ))}
              </span>
              <span className="relative hidden flex-col gap-0.5 px-1 pb-1 sm:flex">
                {list.slice(0, 2).map((s) => (
                  <Link
                    key={s.id}
                    to={`/s/${s.code}/host`}
                    className={cn(
                      'truncate rounded px-1 py-0.5 text-[11px] leading-tight font-medium',
                      CHIP[s.status],
                    )}
                    title={`${fmt.time.format(lectureTime(s))} ${s.topic}`}
                  >
                    {fmt.time.format(lectureTime(s))} <span dir="auto">{s.topic}</span>
                  </Link>
                ))}
                {list.length > 2 && (
                  <span className="pointer-events-none px-1 text-[11px] text-muted-foreground">
                    +{list.length - 2} more
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 border-t pt-4" data-testid="calendar-day">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">{fmt.longDay.format(selected)}</h3>
          {!selectedPast && (
            <Button size="sm" variant="outline" onClick={() => onPlan(selected)}>
              <CalendarPlus /> Plan a lecture
            </Button>
          )}
        </div>
        {selectedList.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {selectedPast ? 'No lectures on this day.' : 'Nothing planned yet.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {selectedList.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/s/${s.code}/host`}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted"
                >
                  <span className={cn('size-2 shrink-0 rounded-full', DOT[s.status])} aria-hidden />
                  <span className="w-12 shrink-0 tabular-nums">{fmt.time.format(lectureTime(s))}</span>
                  <span className="min-w-0 flex-1 truncate font-medium" dir="auto">
                    {s.topic}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{STATUS_LABEL[s.status]}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

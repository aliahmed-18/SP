import { useMemo, useState } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import type { SessionListItem } from '@getit/shared';
import { Button } from '@/components/ui/button';
import { dayKey, fmt, sameDay } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import { lectureTime } from './lecture-time';

const STATUS_DOT = {
  SCHEDULED: 'bg-primary',
  LIVE: 'bg-attention',
  ENDED: 'bg-muted-foreground/40',
} as const;
const STATUS_LABEL = { SCHEDULED: 'Planned', LIVE: 'Live', ENDED: 'Ended' } as const;

/** The 6 weeks (Monday first) that show a month. */
function monthGrid(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // Monday = 0
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(first);
    d.setDate(first.getDate() - offset + i);
    return d;
  });
}

/**
 * Mini month calendar (sidebar) + the chosen day's agenda. A dot per lecture (planned, live, ended);
 * pick a day to see its lectures, open them, or plan a new one on that day.
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
  const onThisMonth = month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();

  return (
    <section
      aria-labelledby="calendar-title"
      className="rounded-2xl border bg-card p-4 shadow-xs"
      data-testid="calendar"
    >
      <div className="mb-2 flex items-center gap-1">
        <h2 id="calendar-title" className="min-w-0 flex-1 font-semibold" aria-live="polite">
          {fmt.month.format(month)}
        </h2>
        {!onThisMonth && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
              setSelected(today);
            }}
          >
            Today
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={() => shift(-1)} aria-label="Previous month">
          <ChevronLeft className="size-5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => shift(1)} aria-label="Next month">
          <ChevronRight className="size-5" />
        </Button>
      </div>

      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-muted-foreground" aria-hidden>
        {days.slice(0, 7).map((d) => (
          <span key={d.toISOString()} className="py-1">
            {fmt.weekday.format(d).slice(0, 2)}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5" role="grid" aria-label={fmt.month.format(month)}>
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
              className="grid place-items-center"
            >
              <button
                type="button"
                onClick={() => {
                  setSelected(d);
                  if (!inMonth) setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                }}
                aria-label={`${fmt.longDay.format(d)}${list.length ? `, ${list.length} ${list.length === 1 ? 'lecture' : 'lectures'}` : ''}`}
                aria-current={isToday ? 'date' : undefined}
                data-testid={`day-${dayKey(d)}`}
                className={cn(
                  'relative flex size-11 flex-col items-center justify-center rounded-xl text-sm tabular-nums transition-colors',
                  !inMonth && 'text-muted-foreground/50',
                  isSelected
                    ? 'bg-primary font-semibold text-primary-foreground'
                    : isToday
                      ? 'bg-accent font-semibold text-primary'
                      : 'hover:bg-muted',
                )}
              >
                {d.getDate()}
                <span className="absolute bottom-1.5 flex gap-0.5" aria-hidden>
                  {list.slice(0, 3).map((s) => (
                    <span
                      key={s.id}
                      className={cn(
                        'size-1 rounded-full',
                        isSelected ? 'bg-primary-foreground' : STATUS_DOT[s.status],
                      )}
                    />
                  ))}
                </span>
              </button>
            </div>
          );
        })}
      </div>
      <div
        className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground"
        aria-hidden
      >
        {(['SCHEDULED', 'LIVE', 'ENDED'] as const).map((st) => (
          <span key={st} className="flex items-center gap-1.5">
            <span className={cn('size-1.5 rounded-full', STATUS_DOT[st])} /> {STATUS_LABEL[st]}
          </span>
        ))}
      </div>

      <div className="mt-4 border-t pt-4" data-testid="calendar-day">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">
            {sameDay(selected, today) ? 'Today' : fmt.longDay.format(selected)}
          </h3>
          {!selectedPast && (
            <Button size="sm" variant="outline" onClick={() => onPlan(selected)}>
              <CalendarPlus /> Plan a lecture
            </Button>
          )}
        </div>
        {selectedList.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            {selectedPast ? 'No lectures on this day.' : 'Nothing planned yet.'}
          </p>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {selectedList.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/s/${s.code}/host`}
                  className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <span className={cn('size-2 shrink-0 rounded-full', STATUS_DOT[s.status])} aria-hidden />
                  <span className="w-11 shrink-0 text-muted-foreground tabular-nums">
                    {fmt.time.format(lectureTime(s))}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium" dir="auto">
                    {s.topic}
                  </span>
                  <span className="sr-only">{STATUS_LABEL[s.status]}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

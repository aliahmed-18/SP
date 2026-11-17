import { EyeOff } from 'lucide-react';
import type { PresentActivity } from '@getit/shared';
import { activityKind } from '@/features/session-instructor/activities/kinds';

/** Shot 06: the live question, big; answer count climbs; results stay hidden. */
export function QuestionScreen({
  activity: a,
  number,
  answered,
  joined,
}: {
  activity: PresentActivity;
  number: { index: number; total: number };
  answered: number;
  joined: number;
}) {
  const choices =
    a.kind === 'TRUE_FALSE'
      ? [
          { letter: 'T', label: 'True' },
          { letter: 'F', label: 'False' },
        ]
      : a.options.map((o, i) => ({ letter: String.fromCharCode(65 + i), label: o }));
  const pct = Math.min(100, (100 * answered) / Math.max(1, joined));
  const { label: kindLabel, Icon } = activityKind(a);
  return (
    <section
      key={`${a.id}:${a.round}`}
      className="run-step flex w-full max-w-6xl flex-col gap-10"
      aria-live="polite"
    >
      <div>
        <p className="mb-4 flex items-center gap-3 text-2xl text-muted-foreground">
          Q{number.index} / {number.total}
          <span
            className="grid size-10 place-items-center rounded-lg bg-accent text-primary"
            title={kindLabel}
          >
            <Icon className="size-5" aria-label={kindLabel} />
          </span>
          {a.round > 1 && (
            <span className="rounded-full bg-accent px-3 py-1 text-xl text-accent-foreground">
              Vote again · round {a.round}
            </span>
          )}
        </p>
        <h1 className="text-5xl leading-tight font-bold xl:text-6xl" dir="auto">
          {a.prompt}
        </h1>
      </div>
      {a.type === 'EXPLAIN' ? (
        <p className="text-4xl font-medium text-primary">Write your answer on your phone</p>
      ) : a.kind === 'NUMERIC' ? (
        <p className="text-3xl text-muted-foreground">Type your answer on your phone.</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {choices.map((c) => (
            <li key={c.letter} className="flex items-center gap-5 rounded-2xl border bg-card p-5">
              <span className="grid size-16 shrink-0 place-items-center rounded-xl bg-muted text-3xl font-semibold">
                {c.letter}
              </span>
              <span className="text-4xl break-words" dir="auto">
                {c.label}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div>
        <p className="text-3xl text-muted-foreground">
          <strong className="text-[4rem] leading-none text-foreground" data-testid="present-answered">
            {answered}
          </strong>{' '}
          / {joined} answered
        </p>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-6 flex items-center justify-center gap-2 text-xl text-muted-foreground">
          <EyeOff className="size-6" aria-hidden />{' '}
          {a.type === 'EXPLAIN' ? 'Answers stay private' : 'Results hidden'}
        </p>
      </div>
    </section>
  );
}

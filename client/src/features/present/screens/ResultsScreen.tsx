import { Check, Lightbulb } from 'lucide-react';
import { answerLabel, suggestion, SUGGESTION_TEXT, type PresentActivity } from '@getit/shared';
import { cn } from '@/lib/utils';

const pct = (n: number) => `${Math.round(n)}%`;

/**
 * Shots 07/08. CLOSED: how the class voted, no correct mark (they can discuss, then vote again).
 * REVEALED: % correct, sure-and-wrong, correct option marked, explanation.
 */
export function ResultsScreen({ activity: a }: { activity: PresentActivity }) {
  const revealed = a.status === 'REVEALED';
  const stats = a.stats[a.stats.length - 1];
  if (!stats) return null;
  const total = Math.max(1, stats.count);
  const rows = a.kind === 'NUMERIC' ? stats.distribution.slice(0, 5) : stats.distribution;
  return (
    <section
      key={`${a.id}:${a.round}:${a.status}`}
      className="run-step flex w-full max-w-6xl flex-col gap-6"
      aria-live="polite"
    >
      <h1 className="text-4xl leading-tight font-bold" dir="auto">
        {a.prompt}
      </h1>
      {a.kind === 'NUMERIC' && revealed && a.tolerance ? (
        <p className="-mt-3 text-2xl text-muted-foreground">Correct within ± {a.tolerance}</p>
      ) : null}
      <div className="grid grid-cols-3 gap-4">
        <Tile label="Responses" value={String(stats.count)} />
        {revealed ? <Tile label="Correct" value={pct(stats.percentCorrect)} /> : <div />}
        {revealed ? <Tile label="Sure and wrong" value={String(stats.sureWrong)} attention /> : <div />}
      </div>
      <ul className="flex flex-col gap-3" aria-label="How the class answered">
        {rows.map((d) => {
          const mark = revealed && d.correct;
          return (
            <li
              key={String(d.answer)}
              className={cn(
                'relative overflow-hidden rounded-2xl border bg-card',
                mark && 'border-correct ring-2 ring-correct',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'absolute inset-y-0 left-0 transition-[width] duration-500',
                  mark ? 'bg-correct/25' : 'bg-muted',
                )}
                style={{ width: `${(100 * d.count) / total}%` }}
              />
              <span className="relative flex items-center gap-4 px-5 py-3">
                {mark && (
                  <span className="grid size-12 place-items-center rounded-xl bg-correct text-white">
                    <Check className="size-7" aria-label="Correct" />
                  </span>
                )}
                <span className="min-w-0 flex-1 text-3xl break-words" dir="auto">
                  {answerLabel(a.kind, a.options, d.answer)}
                </span>
                <span className={cn('text-4xl font-bold', mark && 'text-correct')}>
                  {pct((100 * d.count) / total)}
                </span>
                <span className="w-10 text-right text-xl text-muted-foreground">{d.count}</span>
              </span>
            </li>
          );
        })}
      </ul>
      {stats.count > 0 && (
        <p
          className="rounded-xl border-l-8 border-primary bg-accent px-5 py-3 text-3xl font-medium"
          data-testid="present-suggestion"
        >
          {SUGGESTION_TEXT[suggestion(stats.percentCorrect)]}
        </p>
      )}
      {a.stats.length > 1 && (
        <p className="text-2xl text-muted-foreground">
          {a.stats
            .map(
              (s) =>
                `Round ${s.round}: ${revealed ? pct(s.percentCorrect) + ' correct' : s.count + ' answers'}`,
            )
            .join('  →  ')}
        </p>
      )}
      {revealed && a.explanation && (
        <p className="flex gap-4 rounded-2xl border border-primary/30 bg-accent/60 p-5 text-3xl" dir="auto">
          <Lightbulb className="mt-1 size-8 shrink-0 text-primary" aria-hidden /> {a.explanation}
        </p>
      )}
    </section>
  );
}

function Tile({ label, value, attention }: { label: string; value: string; attention?: boolean }) {
  return (
    <div className={cn('rounded-2xl bg-muted p-5', attention && 'bg-attention/15')}>
      <p
        className={cn(
          'text-2xl text-muted-foreground',
          attention && 'text-attention-foreground dark:text-attention',
        )}
      >
        {label}
      </p>
      <p className="text-[4rem] leading-none font-bold">{value}</p>
    </div>
  );
}

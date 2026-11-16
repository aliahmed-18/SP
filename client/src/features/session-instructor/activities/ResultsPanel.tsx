import { Check, Lightbulb } from 'lucide-react';
import { answerLabel, suggestion, SUGGESTION_TEXT, type HostActivity, type RoundStats } from '@getit/shared';
import { cn } from '@/lib/utils';

const pct = (n: number) => `${Math.round(n)}%`;

/** Results of one round (shots 07/08): Responses · % Correct · Sure and wrong, bars, suggestion. */
export function ResultsPanel({ activity, showAnswer }: { activity: HostActivity; showAnswer: boolean }) {
  const stats = activity.stats;
  const current = stats[stats.length - 1];
  if (!current) return null;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <Tile label="Responses" value={String(current.count)} />
        <Tile label="Correct" value={pct(current.percentCorrect)} />
        <Tile label="Sure and wrong" value={String(current.sureWrong)} attention />
      </div>
      <Distribution activity={activity} stats={current} showAnswer={showAnswer} />
      {current.count > 0 && (
        <p
          className="rounded-lg border-l-4 border-primary bg-accent px-3 py-2 text-sm font-medium"
          data-testid="suggestion"
        >
          {SUGGESTION_TEXT[suggestion(current.percentCorrect)]}
        </p>
      )}
      {stats.length > 1 && <RoundComparison stats={stats} />}
      {showAnswer && activity.explanation && (
        <p className="flex gap-2 rounded-lg border bg-accent/50 p-3 text-sm">
          <Lightbulb className="size-4 shrink-0 text-primary" aria-hidden /> {activity.explanation}
        </p>
      )}
    </div>
  );
}

function Tile({ label, value, attention }: { label: string; value: string; attention?: boolean }) {
  return (
    <div className={cn('rounded-xl bg-muted p-3', attention && 'bg-attention/15')}>
      <p
        className={cn(
          'text-xs text-muted-foreground',
          attention && 'text-attention-foreground dark:text-attention',
        )}
      >
        {label}
      </p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function Distribution({
  activity,
  stats,
  showAnswer,
}: {
  activity: HostActivity;
  stats: RoundStats;
  showAnswer: boolean;
}) {
  const rows = activity.kind === 'NUMERIC' ? stats.distribution.slice(0, 6) : stats.distribution;
  const total = Math.max(1, stats.count);
  const others =
    activity.kind === 'NUMERIC' ? stats.distribution.slice(6).reduce((s, d) => s + d.count, 0) : 0;
  return (
    <ul className="flex flex-col gap-1.5" aria-label="Answers">
      {rows.map((d) => {
        const mark = showAnswer && d.correct;
        return (
          <li
            key={String(d.answer)}
            className={cn('relative overflow-hidden rounded-lg border', mark && 'border-correct')}
          >
            <span
              aria-hidden
              className={cn('absolute inset-y-0 left-0', mark ? 'bg-correct/20' : 'bg-muted')}
              style={{ width: `${(100 * d.count) / total}%` }}
            />
            <span className="relative flex items-center gap-2 px-3 py-1.5 text-sm">
              {mark && <Check className="size-4 text-correct" aria-label="Correct" />}
              <span className="min-w-0 flex-1 truncate" dir="auto">
                {answerLabel(activity.kind, activity.options, d.answer)}
              </span>
              <span className={cn('font-semibold', mark && 'text-correct')}>
                {pct((100 * d.count) / total)}
              </span>
              <span className="w-6 text-right text-xs text-muted-foreground">{d.count}</span>
            </span>
          </li>
        );
      })}
      {others > 0 && <li className="px-3 text-xs text-muted-foreground">+ {others} other answers</li>}
    </ul>
  );
}

function RoundComparison({ stats }: { stats: RoundStats[] }) {
  return (
    <table className="w-full text-sm">
      <caption className="mb-1 text-left text-xs font-medium text-muted-foreground">Round comparison</caption>
      <thead>
        <tr className="text-left text-xs text-muted-foreground">
          <th className="font-normal">Round</th>
          <th className="font-normal">Responses</th>
          <th className="font-normal">Correct</th>
          <th className="font-normal">Sure and wrong</th>
        </tr>
      </thead>
      <tbody>
        {stats.map((s) => (
          <tr key={s.round} className="border-t">
            <td className="py-1">Round {s.round}</td>
            <td>{s.count}</td>
            <td className="font-semibold">{pct(s.percentCorrect)}</td>
            <td>{s.sureWrong}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

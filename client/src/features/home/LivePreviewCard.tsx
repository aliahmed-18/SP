import { ListChecks } from 'lucide-react';

const OPTIONS = [
  { letter: 'A', text: '<link>', pct: 12 },
  { letter: 'B', text: '<a>', pct: 71, correct: true },
  { letter: 'C', text: '<href>', pct: 17 },
];

/** Decorative example of a revealed Quick Check (static, matches reference shot 01). */
export function LivePreviewCard() {
  return (
    <figure
      aria-label="Example: a Quick Check with class results"
      className="w-full max-w-md -rotate-1 rounded-2xl border bg-card p-5 shadow-lg"
    >
      <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-md bg-accent text-primary">
            <ListChecks className="size-3.5" aria-hidden />
          </span>
          Q1 / 4
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-attention/15 px-2 py-0.5 font-medium text-attention-foreground dark:text-attention">
          <span className="size-1.5 rounded-full bg-attention" aria-hidden /> Live
        </span>
      </div>
      <p className="mb-3 font-semibold">Which HTML tag is used to create a link?</p>
      <ul className="flex flex-col gap-2">
        {OPTIONS.map((o) => (
          <li
            key={o.letter}
            className={
              'relative overflow-hidden rounded-xl border ' +
              (o.correct ? 'border-correct ring-1 ring-correct' : '')
            }
          >
            <span
              aria-hidden
              className={'absolute inset-y-0 left-0 ' + (o.correct ? 'bg-correct/15' : 'bg-muted')}
              style={{ width: `${o.pct}%` }}
            />
            <span className="relative flex items-center gap-3 px-3 py-2 text-sm">
              <span
                className={
                  'grid size-6 place-items-center rounded-md text-xs font-semibold ' +
                  (o.correct ? 'bg-correct text-white' : 'bg-card')
                }
              >
                {o.letter}
              </span>
              <code className="flex-1">{o.text}</code>
              <span className={'font-semibold ' + (o.correct ? 'text-correct' : '')}>{o.pct}%</span>
            </span>
          </li>
        ))}
      </ul>
      <figcaption className="mt-3 text-xs text-muted-foreground">
        <strong className="text-foreground">38</strong> / 42 answered
      </figcaption>
    </figure>
  );
}

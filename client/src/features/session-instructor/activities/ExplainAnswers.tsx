import { useState } from 'react';
import { MonitorUp, MonitorX } from 'lucide-react';
import { toast } from 'sonner';
import { EXPLAIN_TAGS, type ExplainTag, type HostActivity } from '@getit/shared';
import { Button } from '@/components/ui/button';
import { api, ApiRequestError } from '@/lib/api';
import { emitAck } from '@/lib/emit';
import { cn } from '@/lib/utils';
import { useHost } from '../host-context';

const TAG_LABEL: Record<ExplainTag, string> = {
  CORRECT: 'Correct',
  PARTIAL: 'Partial',
  MISCONCEPTION: 'Misconception',
};
const TAG_STYLE: Record<ExplainTag, string> = {
  CORRECT: 'border-correct bg-correct/10 text-correct',
  PARTIAL: 'border-primary bg-accent text-accent-foreground',
  MISCONCEPTION: 'border-attention bg-attention/15 text-attention-foreground dark:text-attention',
};
type Filter = 'ALL' | 'UNTAGGED' | ExplainTag;

/** Spec C3: after closing, every answer (no identities), tagged by hand; one misconception → projector. */
export function ExplainAnswers({ activity: a }: { activity: HostActivity }) {
  const { getSocket, projectedAnswerId } = useHost();
  const [filter, setFilter] = useState<Filter>('ALL');
  const answers = a.explainAnswers;
  const count = (f: Filter) =>
    f === 'ALL'
      ? answers.length
      : f === 'UNTAGGED'
        ? answers.filter((x) => !x.tag).length
        : answers.filter((x) => x.tag === f).length;
  const shown = answers.filter(
    (x) => filter === 'ALL' || (filter === 'UNTAGGED' ? !x.tag : x.tag === filter),
  );

  async function tag(id: string, current: ExplainTag | null, next: ExplainTag) {
    try {
      await api(`/responses/${id}/tag`, {
        method: 'PATCH',
        body: JSON.stringify({ tag: current === next ? null : next }),
      });
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Couldn't save the tag.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {a.modelAnswer && (
        <p className="rounded-lg bg-muted p-3 text-sm">
          <span className="font-medium">Model answer (only you see it): </span>
          {a.modelAnswer}
        </p>
      )}
      <p className="text-sm">
        <strong className="text-2xl">{answers.length}</strong> {answers.length === 1 ? 'answer' : 'answers'}
      </p>
      {answers.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter answers">
          {(['ALL', 'UNTAGGED', ...EXPLAIN_TAGS] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                'min-h-9 rounded-full border px-3 text-sm',
                filter === f ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
              )}
            >
              {f === 'ALL' ? 'All' : f === 'UNTAGGED' ? 'Not tagged' : TAG_LABEL[f]} ({count(f)})
            </button>
          ))}
        </div>
      )}
      <ul className="flex flex-col gap-2" data-testid="explain-answers">
        {shown.map((x) => {
          const onProjector = projectedAnswerId === x.id;
          return (
            <li key={x.id} className="rounded-xl border bg-card p-3">
              <p className="mb-2 break-words" dir="auto">
                {x.text}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {EXPLAIN_TAGS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={x.tag === t}
                    onClick={() => void tag(x.id, x.tag, t)}
                    className={cn(
                      'min-h-9 rounded-full border px-3 text-sm',
                      x.tag === t ? TAG_STYLE[t] : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {TAG_LABEL[t]}
                  </button>
                ))}
                {x.tag === 'MISCONCEPTION' && (
                  <Button
                    size="sm"
                    variant={onProjector ? 'secondary' : 'default'}
                    className="ml-auto"
                    aria-pressed={onProjector}
                    onClick={() =>
                      void emitAck(getSocket(), 'present:project', {
                        item: onProjector ? null : { kind: 'misconception', id: x.id },
                      })
                    }
                  >
                    {onProjector ? <MonitorX /> : <MonitorUp />}{' '}
                    {onProjector ? 'Stop showing' : 'Show on projector'}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {answers.length === 0 && <p className="text-sm text-muted-foreground">No answers were sent.</p>}
    </div>
  );
}

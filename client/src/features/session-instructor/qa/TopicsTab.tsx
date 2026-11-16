import { useMemo } from 'react';
import { Check, Layers } from 'lucide-react';
import { sortTopics, type HostState } from '@getit/shared';
import { TopicCard } from './TopicCard';

/** Topics tab (shot 02): open topics by Me too (answer the top one), addressed ones collapsed below. */
export function TopicsTab({ state }: { state: HostState }) {
  const { topics, questions } = state;
  const sorted = useMemo(() => sortTopics(topics, questions), [topics, questions]);
  const open = sorted.filter((t) => t.status === 'OPEN');
  const done = sorted.filter((t) => t.status !== 'OPEN');
  const questionsOf = (id: string) => questions.filter((q) => q.topicId === id);

  if (topics.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border p-8 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-accent text-primary">
          <Layers className="size-6" aria-hidden />
        </span>
        <p className="font-semibold">No topics yet</p>
        <p className="text-sm text-muted-foreground">
          In the List tab, select similar questions and group them into a topic. Students can then tap “Me
          too”.
        </p>
      </div>
    );
  }

  const pct = Math.round((done.length / topics.length) * 100);
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="font-medium">
            Addressed: {done.length} of {topics.length} topics
          </span>
          {open.length > 0 && (
            <span className="text-xs text-muted-foreground">Answer the top one, then mark it.</span>
          )}
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {open.map((t, i) => (
        <TopicCard key={t.id} topic={t} questions={questionsOf(t.id)} nextUp={i === 0} />
      ))}

      {done.length > 0 && (
        <details className="rounded-2xl border" open={open.length === 0}>
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 font-medium">
            <Check className="size-4 text-primary" aria-hidden /> Addressed ({done.length})
          </summary>
          <div className="flex flex-col gap-3 p-3 pt-0">
            {done.map((t) => (
              <TopicCard key={t.id} topic={t} questions={questionsOf(t.id)} nextUp={false} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

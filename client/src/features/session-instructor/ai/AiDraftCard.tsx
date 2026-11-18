import { MessageSquareText } from 'lucide-react';
import { answerLabel, type AiDraft } from '@getit/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { KIND_ICON, KIND_LABEL } from '../activities/kinds';

/** One generated draft as the instructor reviews it (answer + explanation visible). */
export function AiDraftCard({ draft: d }: { draft: AiDraft }) {
  if (d.type === 'EXPLAIN')
    return (
      <div className="min-w-0 flex-1 text-sm">
        <Badge variant="accent" className="mb-1">
          <MessageSquareText aria-hidden /> Explain
        </Badge>
        <p className="font-medium" dir="auto">
          {d.prompt}
        </p>
        {d.modelAnswer && (
          <p className="mt-1 text-muted-foreground" dir="auto">
            Model answer (only you see it): {d.modelAnswer}
          </p>
        )}
      </div>
    );
  const Icon = KIND_ICON[d.kind];
  return (
    <div className="min-w-0 flex-1 text-sm">
      <Badge variant="accent" className="mb-1">
        <Icon aria-hidden /> {KIND_LABEL[d.kind]}
      </Badge>
      <p className="font-medium" dir="auto">
        {d.prompt}
      </p>
      {d.kind === 'MCQ' ? (
        <ul className="mt-1">
          {d.options.map((o, j) => (
            <li
              key={j}
              dir="auto"
              className={cn(j === d.correct ? 'font-semibold text-correct' : 'text-muted-foreground')}
            >
              {j === d.correct ? '✓' : '·'} {answerLabel('MCQ', d.options, j)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 font-semibold text-correct">
          ✓{' '}
          {d.kind === 'NUMERIC'
            ? `${d.correct}${d.tolerance ? ` ± ${d.tolerance}` : ''}`
            : answerLabel('TRUE_FALSE', [], d.correct)}
        </p>
      )}
      <p className="mt-1 text-muted-foreground" dir="auto">
        {d.explanation}
      </p>
    </div>
  );
}

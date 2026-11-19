import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import type { AiGradeResult, HostActivity } from '@getit/shared';
import { Spinner } from '@/components/brand/brand';
import { Button } from '@/components/ui/button';
import { api, ApiRequestError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { TAG_LABEL, TAG_STYLE } from '../activities/explain-tags';
import { aiApi } from './ai-api';
import { Elapsed } from './Elapsed';

/** Put back what the AI tagged (the instructor's own tags were never touched). */
async function undo(ids: string[]) {
  try {
    for (const id of ids)
      await api(`/responses/${id}/tag`, { method: 'PATCH', body: JSON.stringify({ tag: null }) });
    toast.success('AI grading undone');
  } catch (err) {
    toast.error(err instanceof ApiRequestError ? err.message : "Couldn't undo. Try again.");
  }
}

/**
 * "Grade with AI": one click tags every untagged answer (Correct / Partial / Misconception) on the
 * server; the answers list updates live. Then a short summary of what the AI found, with Undo.
 */
export function AiGradeButton({ activity: a }: { activity: HostActivity }) {
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState<AiGradeResult | null>(null);
  const untagged = a.explainAnswers.filter((x) => !x.tag).length;

  async function grade() {
    setGrading(true);
    try {
      const r = await aiApi.gradeAnswers(a.id);
      setResult(r);
      const { CORRECT, PARTIAL, MISCONCEPTION } = r.counts;
      toast.success(`AI graded ${r.graded} ${r.graded === 1 ? 'answer' : 'answers'}`, {
        description: `${CORRECT} correct · ${PARTIAL} partial · ${MISCONCEPTION} misconception — change any tag you disagree with.`,
        duration: 10_000,
        action: r.graded
          ? { label: 'Undo', onClick: () => void undo(r.changedIds).then(() => setResult(null)) }
          : undefined,
      });
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Something went wrong.', {
        description: 'You can still tag answers by hand.',
      });
    } finally {
      setGrading(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => void grade()}
        disabled={grading || untagged === 0}
        title={untagged === 0 ? 'Every answer already has a tag.' : undefined}
        className="border-primary/40"
        data-testid="ai-grade"
      >
        {grading ? <Spinner decorative className="!size-4" /> : <Sparkles className="text-attention" />}
        {grading ? (
          <>
            Grading… <Elapsed />
          </>
        ) : (
          'Grade with AI'
        )}
      </Button>
      {result && result.groups.length > 0 && (
        <div
          className="w-full rounded-xl border border-primary/30 bg-accent/30 p-3"
          data-testid="ai-grade-summary"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">What the AI found</p>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => setResult(null)}
              aria-label="Hide"
            >
              <X className="size-4" />
            </Button>
          </div>
          <ul className="flex flex-col gap-1.5 text-sm">
            {result.groups.map((g, i) => (
              <li key={i} className="flex items-center gap-2">
                <span
                  className={cn(
                    'shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium',
                    TAG_STYLE[g.tag],
                  )}
                >
                  {TAG_LABEL[g.tag]}
                </span>
                <span className="min-w-0 flex-1" dir="auto">
                  {g.label}
                </span>
                <span className="text-muted-foreground">{g.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

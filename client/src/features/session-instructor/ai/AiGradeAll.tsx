import { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { AiGradeJob, HostActivity } from '@getit/shared';
import { Spinner } from '@/components/brand/brand';
import { Button } from '@/components/ui/button';
import { api, ApiRequestError } from '@/lib/api';
import { aiApi } from './ai-api';
import { Elapsed } from './Elapsed';

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
 * "Grade all written answers": one click grades every closed Explain's untagged answers with AI, in the
 * background (the instructor's own tags are kept). Progress shows here; a toast with Undo when done.
 */
export function AiGradeAll({
  code,
  job,
  activities,
}: {
  code: string;
  job: AiGradeJob | null;
  activities: HostActivity[];
}) {
  const [starting, setStarting] = useState(false);
  const running = job?.status === 'running';
  const waiting = activities.filter(
    (a) =>
      a.type === 'EXPLAIN' &&
      (a.status === 'CLOSED' || a.status === 'REVEALED') &&
      a.explainAnswers.some((x) => !x.tag),
  );
  const answers = waiting.reduce((n, a) => n + a.explainAnswers.filter((x) => !x.tag).length, 0);

  const prev = useRef(job?.status);
  useEffect(() => {
    if (prev.current === 'running' && job && job.status !== 'running') {
      if (job.status === 'done') {
        const { CORRECT, PARTIAL, MISCONCEPTION } = job.counts;
        toast.success(`AI graded ${job.graded} written ${job.graded === 1 ? 'answer' : 'answers'}`, {
          description:
            `${CORRECT} correct · ${PARTIAL} partial · ${MISCONCEPTION} misconception.` +
            (job.error ? ` ${job.error}` : ' Change any tag you disagree with.'),
          duration: 12_000,
          action: job.changedIds.length
            ? { label: 'Undo', onClick: () => void undo(job.changedIds) }
            : undefined,
        });
      } else toast.error(job.error ?? "The AI couldn't grade the answers this time.");
    }
    prev.current = job?.status;
  }, [job]);

  async function start() {
    setStarting(true);
    try {
      await aiApi.gradeAll(code);
      toast.info('Grading written answers in the background', {
        description: 'Keep teaching — the tags appear as each activity is done.',
      });
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    } finally {
      setStarting(false);
    }
  }

  if (running)
    return (
      <div
        className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-accent/50 p-4"
        role="status"
        data-testid="ai-grade-job"
      >
        <Spinner decorative className="!size-6" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            AI is grading written answers… {job.done} of {job.activities}{' '}
            {job.activities === 1 ? 'activity' : 'activities'} done
          </p>
          <p className="text-sm text-muted-foreground">
            Keep teaching — the tags appear as they're done. <Elapsed since={job.startedAt} />
          </p>
        </div>
      </div>
    );
  if (answers === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border p-4" data-testid="ai-grade-all">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent">
        <Sparkles className="size-5 text-attention" aria-hidden />
      </span>
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">
          {answers} written {answers === 1 ? 'answer' : 'answers'} not graded yet
        </span>
        <span className="block text-muted-foreground">
          in {waiting.length} Explain {waiting.length === 1 ? 'activity' : 'activities'}. Your own tags are
          kept.
        </span>
      </p>
      <Button
        variant="outline"
        onClick={() => void start()}
        disabled={starting}
        className="border-primary/40"
      >
        <Sparkles className="text-attention" /> Grade all with AI
      </Button>
    </div>
  );
}

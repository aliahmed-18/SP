import { useEffect, useRef, useState } from 'react';
import { CircleCheck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { AiJob } from '@getit/shared';
import { Spinner } from '@/components/brand/brand';
import { Button } from '@/components/ui/button';
import { ApiRequestError } from '@/lib/api';
import { ConfirmDialog } from '../qa/ConfirmDialog';
import { aiApi } from './ai-api';
import { Elapsed } from './Elapsed';

/**
 * Above the activities list (MVP): "AI is preparing drafts… 3 of 8" while the server works, then
 * "AI drafts waiting for review: n" with Confirm all. A toast says when a generation finishes — even if
 * the instructor was busy elsewhere on the page.
 */
export function AiActivityBar({ code, job, drafts }: { code: string; job: AiJob | null; drafts: number }) {
  const [confirming, setConfirming] = useState(false);

  // Toast only on the running → finished transition (not for a job that ended before this page loaded).
  const prev = useRef(job?.status);
  useEffect(() => {
    if (prev.current === 'running' && job && job.status !== 'running') {
      if (job.status === 'done')
        toast.success(
          `${job.received} AI ${job.received === 1 ? 'draft is' : 'drafts are'} ready to review`,
          {
            description: job.error ?? 'Check each one in your activities list, then confirm it.',
            duration: 10_000,
          },
        );
      else toast.error(job.error ?? "The AI couldn't prepare drafts this time.", { duration: 10_000 });
    }
    prev.current = job?.status;
  }, [job]);

  async function confirmAll() {
    try {
      const { confirmed } = await aiApi.confirmAll(code);
      toast.success(`${confirmed} ${confirmed === 1 ? 'draft' : 'drafts'} confirmed`);
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    }
  }

  const running = job?.status === 'running';
  if (!running && drafts === 0 && !(job?.status === 'failed' && job.error)) return null;
  return (
    <div className="flex flex-col gap-2">
      {running && (
        <div
          className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-accent/50 p-4"
          role="status"
          data-testid="ai-job"
        >
          <Spinner decorative className="!size-6" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              AI is preparing drafts… {job.received} of {job.expected} ready
            </p>
            <p className="text-sm text-muted-foreground">
              Keep teaching — they appear below as they're written. <Elapsed since={job.startedAt} />
            </p>
          </div>
        </div>
      )}
      {!running && job?.status === 'failed' && job.error && (
        <p
          className="rounded-2xl border border-destructive/30 p-4 text-sm"
          role="alert"
          data-testid="ai-job-error"
        >
          <Sparkles className="mr-1 inline size-4 text-attention" aria-hidden />
          {job.error}
        </p>
      )}
      {drafts > 0 && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-2xl border border-attention/50 bg-attention/10 p-4"
          data-testid="ai-review-bar"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-card">
            <Sparkles className="size-5 text-attention" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">AI drafts waiting for review: {drafts}</p>
            <p className="text-sm text-muted-foreground">
              Open each draft to check it, or confirm them all at once.
            </p>
          </div>
          <Button onClick={() => setConfirming(true)}>
            <CircleCheck /> Confirm all
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Confirm all AI drafts (${drafts}) without reviewing them?`}
        body="AI drafts can contain mistakes, including a wrong correct answer. Confirmed drafts can be launched straight away, and you can still edit any of them before launching."
        confirm="Confirm all"
        onConfirm={() => void confirmAll()}
      />
    </div>
  );
}

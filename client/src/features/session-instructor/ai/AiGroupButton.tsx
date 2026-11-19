import { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { AI_LIMITS, type HostState } from '@getit/shared';
import { Spinner } from '@/components/brand/brand';
import { Button } from '@/components/ui/button';
import { ApiRequestError } from '@/lib/api';
import { aiApi } from './ai-api';
import { AiGroupDialog } from './AiGroupDialog';

/**
 * "Group with AI" in the background: one click starts it on the server and the instructor carries on;
 * when the AI is done, the suggestions pop up to review and apply (even after a page reload).
 */
export function AiGroupButton({ state }: { state: HostState }) {
  const code = state.session.code;
  const job = state.aiGroup;
  const running = job?.status === 'running';
  const [starting, setStarting] = useState(false);
  const ungrouped = state.questions.filter((q) => !q.topicId && q.partId === state.parts.at(-1)?.id).length;
  const tooFew = ungrouped < AI_LIMITS.groupQuestionsMin;

  const dismiss = () => void aiApi.dismissGroup(code).catch(() => {});

  // Finished with nothing to show, or failed: say so once, then clear it.
  const prev = useRef(job?.status);
  useEffect(() => {
    if (prev.current === 'running' && job && job.status !== 'running' && job.suggestions.length === 0) {
      if (job.status === 'failed') toast.error(job.error ?? "The AI couldn't group the questions.");
      else toast.info('No clear groups yet. Try again when more questions come in.');
      void aiApi.dismissGroup(code).catch(() => {});
    }
    prev.current = job?.status;
  }, [job, code]);

  async function start() {
    setStarting(true);
    try {
      await aiApi.group(code);
      toast.info('Grouping questions in the background', {
        description: "Keep teaching — the suggested topics pop up when they're ready.",
      });
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    } finally {
      setStarting(false);
    }
  }

  const ready = job?.status === 'done' && job.suggestions.length > 0;
  return (
    <>
      <Button
        size="sm"
        onClick={() => void start()}
        disabled={tooFew || running || starting}
        title={
          tooFew
            ? `Needs at least ${AI_LIMITS.groupQuestionsMin} questions that aren't in a topic`
            : undefined
        }
        data-testid="ai-group"
      >
        {running ? <Spinner decorative className="!size-4" /> : <Sparkles className="text-attention" />}
        {running ? 'Grouping…' : 'Group with AI'}
      </Button>
      {ready && (
        <AiGroupDialog key={job.startedAt} state={state} suggestions={job.suggestions} onClose={dismiss} />
      )}
    </>
  );
}

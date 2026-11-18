import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { RotateCcw, Tags } from 'lucide-react';
import { toast } from 'sonner';
import type { AiAnswerGroup, HostActivity } from '@getit/shared';
import { Spinner } from '@/components/brand/brand';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api, ApiRequestError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { TAG_LABEL, TAG_STYLE } from '../activities/explain-tags';
import { AI_PRIVACY_NOTE, aiApi } from './ai-api';

/**
 * "Sort answers with AI" (MVP: the AI groups Explain answers so misconceptions stand out). Shows groups
 * of similar answers with a suggested tag; ticked groups are tagged through the normal tag endpoint.
 * Mounted only while open.
 */
export function AiSortDialog({ activity: a, onClose }: { activity: HostActivity; onClose: () => void }) {
  const [rows, setRows] = useState<(AiAnswerGroup & { on: boolean })[]>([]);
  const [applying, setApplying] = useState(false);
  const sort = useMutation({
    mutationFn: () => aiApi.sortAnswers(a.id),
    onSuccess: (r) => setRows(r.groups.map((g) => ({ ...g, on: true }))),
  });
  const { mutate } = sort;
  const asked = useRef(false); // React's dev double-run of effects must not spend two AI requests
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    mutate();
  }, [mutate]);

  const text = new Map(a.explainAnswers.map((x) => [x.id, x.text]));
  const chosen = rows.filter((r) => r.on);
  const tagged = chosen.reduce((n, r) => n + r.answerIds.length, 0);

  async function apply() {
    setApplying(true);
    try {
      for (const g of chosen)
        for (const id of g.answerIds)
          await api(`/responses/${id}/tag`, { method: 'PATCH', body: JSON.stringify({ tag: g.tag }) });
      toast.success(`${tagged} ${tagged === 1 ? 'answer' : 'answers'} tagged`);
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Couldn't save the tags.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sort answers with AI</DialogTitle>
          <DialogDescription>
            Similar answers grouped, with a suggested tag. Untick any group you disagree with, then apply.
          </DialogDescription>
        </DialogHeader>

        {sort.isPending ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center" role="status">
            <Spinner decorative className="!size-8" />
            <p className="font-medium">Reading the answers…</p>
          </div>
        ) : sort.isError ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center" data-testid="ai-error">
            <p className="font-medium">
              {sort.error instanceof ApiRequestError ? sort.error.message : 'Something went wrong.'}
            </p>
            <p className="text-sm text-muted-foreground">You can still tag answers by hand.</p>
            <Button variant="outline" onClick={() => mutate()}>
              <RotateCcw /> Try again
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col gap-3" data-testid="ai-answer-groups">
            {rows.map((g, i) => (
              <li key={i} className={cn('rounded-xl border p-3', !g.on && 'opacity-60')}>
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={g.on}
                    onChange={(e) =>
                      setRows((prev) => prev.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))
                    }
                    className="mt-1 size-5 shrink-0 accent-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'rounded-full border px-2.5 py-0.5 text-xs font-medium',
                          TAG_STYLE[g.tag],
                        )}
                      >
                        {TAG_LABEL[g.tag]}
                      </span>
                      <span className="font-medium" dir="auto">
                        {g.label}
                      </span>
                      <span className="text-sm text-muted-foreground">· {g.answerIds.length}</span>
                    </span>
                    <span className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
                      {g.answerIds.map((id) => (
                        <span key={id} dir="auto">
                          “{text.get(id) ?? '…'}”
                        </span>
                      ))}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-muted-foreground">{AI_PRIVACY_NOTE}</p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void apply()} disabled={tagged === 0 || applying || sort.isPending}>
            <Tags /> {tagged === 1 ? 'Tag 1 answer' : `Tag ${tagged} answers`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

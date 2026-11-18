import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { FolderInput, Layers, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import type { AiTopicSuggestion, HostState, HostTopic } from '@getit/shared';
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
import { Input } from '@/components/ui/input';
import { api, ApiRequestError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { AI_PRIVACY_NOTE, aiApi } from './ai-api';

type Row = AiTopicSuggestion & { on: boolean };

/** Undo an AI grouping: delete the topics it created (their questions become ungrouped again). */
async function undo(created: string[], moved: string[]) {
  try {
    for (const id of created) await api(`/topics/${id}`, { method: 'DELETE' });
    for (const id of moved)
      await api(`/questions/${id}`, { method: 'PATCH', body: JSON.stringify({ topicId: null }) });
    toast.success('Grouping undone');
  } catch (err) {
    toast.error(err instanceof ApiRequestError ? err.message : "Couldn't undo. Try again.");
  }
}

/**
 * "Group with AI" (MVP: Classify): the AI proposes topics for the ungrouped questions of the current
 * part; the instructor ticks, renames and applies them. Applying uses the normal topic endpoints.
 * Render it only while open.
 */
export function AiGroupDialog({
  state,
  open,
  onOpenChange,
}: {
  state: HostState;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const code = state.session.code;
  const [rows, setRows] = useState<Row[]>([]);
  const [applying, setApplying] = useState(false);
  const suggest = useMutation({
    mutationFn: () => aiApi.group(code),
    onSuccess: (r) => setRows(r.suggestions.map((s) => ({ ...s, on: true }))),
  });
  const { mutate } = suggest;

  // Mounted only while open (see QaPanel), so each opening asks once and starts fresh.
  // A ref, not state: React's dev double-run of effects must not spend two AI requests.
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    mutate();
  }, [mutate]);

  const text = new Map(state.questions.map((q) => [q.id, q.text]));
  const chosen = rows.filter((r) => r.on && r.title.trim());
  const update = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function apply() {
    setApplying(true);
    const created: string[] = [];
    const moved: string[] = [];
    try {
      for (const r of chosen) {
        if (r.topicId) {
          await api(`/topics/${r.topicId}/questions`, {
            method: 'POST',
            body: JSON.stringify({ questionIds: r.questionIds }),
          });
          moved.push(...r.questionIds);
        } else {
          const t = await api<HostTopic>(`/sessions/${code}/topics`, {
            method: 'POST',
            body: JSON.stringify({ title: r.title.trim(), questionIds: r.questionIds }),
          });
          created.push(t.id);
        }
      }
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Something went wrong. Try again.');
    }
    setApplying(false);
    const done = created.length + (moved.length ? 1 : 0);
    if (done === 0) return;
    // MVP: "The AI groups them by topic at once, and you can undo."
    const message =
      created.length === 0
        ? 'Questions added to topics'
        : created.length === 1
          ? '1 topic created'
          : `${created.length} topics created`;
    toast.success(message, {
      duration: 10_000,
      action: { label: 'Undo', onClick: () => void undo(created, moved) },
    });
    onOpenChange(false);
  }

  const error = suggest.error instanceof ApiRequestError ? suggest.error.message : 'Something went wrong.';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Group with AI</DialogTitle>
          <DialogDescription>
            Suggested topics for this part's questions that aren't in a topic yet. Untick or rename any before
            you apply them.
          </DialogDescription>
        </DialogHeader>

        {suggest.isPending ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center" role="status">
            <Spinner decorative className="!size-8" />
            <p className="font-medium">Reading the questions…</p>
            <p className="text-sm text-muted-foreground">This takes a few seconds.</p>
          </div>
        ) : suggest.isError ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center" data-testid="ai-error">
            <p className="font-medium">{error}</p>
            <p className="text-sm text-muted-foreground">You can still group questions by hand.</p>
            <Button variant="outline" onClick={() => mutate()}>
              <RotateCcw /> Try again
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            No clear groups yet. Try again when more questions come in.
          </p>
        ) : (
          <ul className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto pr-1" data-testid="ai-suggestions">
            {rows.map((r, i) => (
              <li
                key={i}
                className={cn(
                  'rounded-xl border p-3',
                  r.on ? 'border-primary/40 bg-accent/40' : 'opacity-60',
                )}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={r.on}
                    onChange={(e) => update(i, { on: e.target.checked })}
                    className="size-5 shrink-0 accent-primary"
                    aria-label={`Use topic ${r.title}`}
                  />
                  {r.topicId ? (
                    <p className="flex min-h-11 flex-1 items-center gap-2 font-medium" dir="auto">
                      <FolderInput className="size-4 text-muted-foreground" aria-hidden />
                      Add to “{r.title}”
                    </p>
                  ) : (
                    <Input
                      value={r.title}
                      onChange={(e) => update(i, { title: e.target.value })}
                      maxLength={100}
                      dir="auto"
                      aria-label="Topic title"
                      className="flex-1 font-medium"
                    />
                  )}
                  <span className="shrink-0 text-sm text-muted-foreground">
                    {r.questionIds.length} questions
                  </span>
                </div>
                <ul className="mt-2 flex flex-col gap-1 pl-8 text-sm text-muted-foreground">
                  {r.questionIds.map((id) => (
                    <li key={id} dir="auto">
                      • {text.get(id) ?? 'Question no longer here'}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-muted-foreground">{AI_PRIVACY_NOTE}</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void apply()}
            disabled={chosen.length === 0 || applying || suggest.isPending}
          >
            <Layers />
            {chosen.length <= 1 ? 'Apply topic' : `Apply ${chosen.length} topics`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from 'react';
import { FolderInput, Layers } from 'lucide-react';
import { toast } from 'sonner';
import type { AiTopicSuggestion, HostState, HostTopic } from '@getit/shared';
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
import { AI_PRIVACY_NOTE } from './ai-api';

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
 * "Group with AI" (MVP: Classify), review step: the server grouped the questions in the background and
 * this pops up with its suggestions; the instructor ticks, renames and applies them (normal topic
 * endpoints, with Undo). Closing or applying dismisses the suggestions. Mount it only while open.
 */
export function AiGroupDialog({
  state,
  suggestions,
  onClose,
}: {
  state: HostState;
  suggestions: AiTopicSuggestion[];
  onClose: () => void;
}) {
  const code = state.session.code;
  const [rows, setRows] = useState<Row[]>(() => suggestions.map((s) => ({ ...s, on: true })));
  const [applying, setApplying] = useState(false);

  const text = new Map(state.questions.map((q) => [q.id, q.text]));
  const ungroupedIds = new Set(state.questions.filter((q) => !q.topicId).map((q) => q.id));
  const chosen = rows.filter((r) => r.on && r.title.trim());
  const update = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function apply() {
    setApplying(true);
    const created: string[] = [];
    const moved: string[] = [];
    try {
      for (const r of chosen) {
        // Questions removed or grouped by hand since the suggestion are left out.
        const questionIds = r.questionIds.filter((id) => ungroupedIds.has(id));
        if (questionIds.length === 0) continue;
        if (r.topicId) {
          await api(`/topics/${r.topicId}/questions`, {
            method: 'POST',
            body: JSON.stringify({ questionIds }),
          });
          moved.push(...questionIds);
        } else {
          const t = await api<HostTopic>(`/sessions/${code}/topics`, {
            method: 'POST',
            body: JSON.stringify({ title: r.title.trim(), questionIds }),
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
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Group with AI</DialogTitle>
          <DialogDescription>
            The AI grouped this part's questions that aren't in a topic yet. Untick or rename any before you
            apply them.
          </DialogDescription>
        </DialogHeader>

        {rows.length === 0 ? (
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
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void apply()} disabled={chosen.length === 0 || applying}>
            <Layers />
            {chosen.length <= 1 ? 'Apply topic' : `Apply ${chosen.length} topics`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

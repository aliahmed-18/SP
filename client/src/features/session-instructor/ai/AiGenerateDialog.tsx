import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { AI_LIMITS, answerLabel, type QuickCheckDraft, type QuickCheckKind } from '@getit/shared';
import { Spinner } from '@/components/brand/brand';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiRequestError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { KIND_ICON, KIND_LABEL } from '../activities/kinds';
import { AI_PRIVACY_NOTE, aiApi } from './ai-api';

const KINDS: QuickCheckKind[] = ['MCQ', 'TRUE_FALSE', 'NUMERIC'];
const COUNTS = [3, 5, 8] as const;

/**
 * "AI generation" (MVP): paste slide text or notes → Quick Check drafts to review. Ticked drafts are added
 * to the activities list as DRAFT (never launched), where the instructor can edit them like any other.
 */
export function AiGenerateDialog({
  code,
  open,
  onOpenChange,
}: {
  code: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  // Kept while the dialog is closed, so "Back" or reopening doesn't lose a long paste.
  const [text, setText] = useState('');
  const [count, setCount] = useState<number>(5);
  const [kinds, setKinds] = useState<QuickCheckKind[]>(['MCQ', 'TRUE_FALSE']);
  const [drafts, setDrafts] = useState<(QuickCheckDraft & { on: boolean })[] | null>(null);
  const [adding, setAdding] = useState(false);
  const gen = useMutation({
    mutationFn: () => aiApi.generate(code, { text, count, kinds }),
    onSuccess: (r) => setDrafts(r.drafts.map((d) => ({ ...d, on: true }))),
  });

  const length = text.trim().length;
  const tooShort = length < AI_LIMITS.slideTextMin;
  const chosen = drafts?.filter((d) => d.on) ?? [];

  async function add() {
    setAdding(true);
    let added = 0;
    for (const { on: _on, ...draft } of chosen) {
      try {
        await api(`/sessions/${code}/activities`, { method: 'POST', body: JSON.stringify(draft) });
        added++;
      } catch (err) {
        toast.error(err instanceof ApiRequestError ? err.message : "Couldn't add a draft. Try again.");
        break;
      }
    }
    setAdding(false);
    if (added > 0) {
      toast.success(
        `${added} ${added === 1 ? 'draft' : 'drafts'} added. Check ${added === 1 ? 'it' : 'them'} before you launch.`,
      );
      setDrafts(null);
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>AI generation</DialogTitle>
          <DialogDescription>
            Paste your slide text or lecture notes. You get Quick Check drafts to review; nothing reaches
            students until you launch it.
          </DialogDescription>
        </DialogHeader>

        {gen.isPending ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center" role="status">
            <Spinner decorative className="!size-8" />
            <p className="font-medium">Preparing drafts…</p>
            <p className="text-sm text-muted-foreground">This can take up to 20 seconds.</p>
          </div>
        ) : drafts ? (
          <ul className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto pr-1" data-testid="ai-drafts">
            {drafts.map((d, i) => {
              const Icon = KIND_ICON[d.kind];
              return (
                <li
                  key={i}
                  className={cn(
                    'flex gap-3 rounded-xl border p-3',
                    d.on ? 'border-primary/40 bg-accent/40' : 'opacity-60',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={d.on}
                    onChange={(e) =>
                      setDrafts((prev) => prev!.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))
                    }
                    className="mt-1 size-5 shrink-0 accent-primary"
                    aria-label={`Use draft: ${d.prompt}`}
                  />
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
                            className={cn(
                              j === d.correct ? 'font-semibold text-correct' : 'text-muted-foreground',
                            )}
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
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="ai-text">Slide text or lecture notes</Label>
              <Textarea
                id="ai-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={AI_LIMITS.slideTextMax}
                rows={8}
                dir="auto"
                placeholder="Copy the text from your slides (Ctrl + A, Ctrl + C in PowerPoint's outline view) and paste it here."
                className="max-h-72"
              />
              <p className="text-xs text-muted-foreground">
                {length.toLocaleString('en')} / {AI_LIMITS.slideTextMax.toLocaleString('en')} characters
                {tooShort && ` · at least ${AI_LIMITS.slideTextMin}`}
              </p>
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">Question types</legend>
              <div className="flex flex-wrap gap-2">
                {KINDS.map((k) => {
                  const on = kinds.includes(k);
                  const Icon = KIND_ICON[k];
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setKinds((prev) => (on ? prev.filter((x) => x !== k) : [...prev, k]))}
                      className={cn(
                        'flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-medium',
                        on && 'border-primary bg-accent text-accent-foreground ring-1 ring-primary',
                      )}
                    >
                      <Icon className="size-4" aria-hidden /> {KIND_LABEL[k]}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">How many drafts</legend>
              <div className="flex gap-2">
                {COUNTS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={count === c}
                    onClick={() => setCount(c)}
                    className={cn(
                      'min-h-11 w-16 rounded-xl border font-medium',
                      count === c && 'border-primary bg-accent text-accent-foreground ring-1 ring-primary',
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </fieldset>
            {gen.isError && (
              <p
                className="rounded-lg border border-destructive/40 p-3 text-sm"
                role="alert"
                data-testid="ai-error"
              >
                {gen.error instanceof ApiRequestError ? gen.error.message : 'Something went wrong.'} You can
                still write activities by hand.
              </p>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground">{AI_PRIVACY_NOTE}</p>
        <DialogFooter>
          {drafts ? (
            <>
              <Button variant="outline" onClick={() => setDrafts(null)}>
                <ArrowLeft /> Back
              </Button>
              <Button onClick={() => void add()} disabled={chosen.length === 0 || adding}>
                <Plus /> {chosen.length === 1 ? 'Add 1 draft' : `Add ${chosen.length} drafts`}
              </Button>
            </>
          ) : (
            <Button
              onClick={() => gen.mutate()}
              disabled={tooShort || kinds.length === 0 || gen.isPending}
              data-testid="ai-generate"
            >
              <Sparkles /> Generate drafts
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

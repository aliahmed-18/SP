import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, MessageSquareText, Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { AI_LIMITS, type AiDraft, type AiGenerateKind } from '@getit/shared';
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
import { KIND_ICON, KIND_LABEL } from '../activities/kinds';
import { AI_PRIVACY_NOTE, aiApi } from './ai-api';
import { AiDraftCard } from './AiDraftCard';
import { Elapsed } from './Elapsed';
import { AiSourceFields } from './AiSourceFields';
import { sourceText, type SourceFile } from './source-text';

const KINDS: { kind: AiGenerateKind; label: string; Icon: typeof Sparkles }[] = [
  { kind: 'MCQ', label: KIND_LABEL.MCQ, Icon: KIND_ICON.MCQ },
  { kind: 'TRUE_FALSE', label: KIND_LABEL.TRUE_FALSE, Icon: KIND_ICON.TRUE_FALSE },
  { kind: 'NUMERIC', label: KIND_LABEL.NUMERIC, Icon: KIND_ICON.NUMERIC },
  { kind: 'EXPLAIN', label: 'Explain', Icon: MessageSquareText },
];
const COUNTS = [3, 5, 8] as const;

/**
 * "AI generation" (MVP: Prepare from slides): upload slides / notes or paste text → drafts to review
 * (Quick Checks and Explain prompts). Ticked drafts are added to the activities list as DRAFT — never
 * launched — where the instructor can edit them like any other activity.
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
  // Kept while the dialog is closed, so "Back" or reopening doesn't lose uploads or a long paste.
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [pasted, setPasted] = useState('');
  const [note, setNote] = useState('');
  const [count, setCount] = useState<number>(5);
  const [kinds, setKinds] = useState<AiGenerateKind[]>(['MCQ', 'TRUE_FALSE']);
  const [drafts, setDrafts] = useState<{ draft: AiDraft; on: boolean }[] | null>(null);
  const [adding, setAdding] = useState(false);

  const text = sourceText(files, pasted);
  const reading = files.some((f) => f.text === null && !f.error);
  const tooShort = text.length < AI_LIMITS.slideTextMin;
  const tooLong = text.length > AI_LIMITS.slideTextMax;
  const gen = useMutation({
    mutationFn: () => aiApi.generate(code, { text, count, kinds, note }),
    onSuccess: (r) => setDrafts(r.drafts.map((draft) => ({ draft, on: true }))),
  });
  const chosen = drafts?.filter((d) => d.on) ?? [];

  async function add() {
    setAdding(true);
    let added = 0;
    for (const { draft } of chosen) {
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

  let hint: string | null = null;
  if (reading) hint = 'Reading your files…';
  else if (tooLong)
    hint = `That's too much text (${text.length.toLocaleString('en')} characters, max ${AI_LIMITS.slideTextMax.toLocaleString('en')}). Remove a file or upload a shorter one.`;
  else if (tooShort && (files.length || pasted))
    hint = `Add a bit more material (at least ${AI_LIMITS.slideTextMin} characters).`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>AI generation</DialogTitle>
          <DialogDescription>
            Upload your slides or notes and get Quick Checks and Explain prompts to review. Nothing reaches
            students until you launch it.
          </DialogDescription>
        </DialogHeader>

        {gen.isPending ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center" role="status">
            <Spinner decorative className="!size-8" />
            <p className="font-medium">Preparing drafts…</p>
            <p className="text-sm text-muted-foreground">
              Checking every answer can take a minute or two. <Elapsed />
            </p>
          </div>
        ) : drafts ? (
          <ul className="flex flex-col gap-3" data-testid="ai-drafts">
            {drafts.map(({ draft, on }, i) => (
              <li
                key={i}
                className={cn(
                  'flex gap-3 rounded-xl border p-3',
                  on ? 'border-primary/40 bg-accent/40' : 'opacity-60',
                )}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) =>
                    setDrafts((prev) => prev!.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))
                  }
                  className="mt-1 size-5 shrink-0 accent-primary"
                  aria-label={`Use draft: ${draft.prompt}`}
                />
                <AiDraftCard draft={draft} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col gap-4">
            <AiSourceFields
              files={files}
              setFiles={setFiles}
              pasted={pasted}
              setPasted={setPasted}
              note={note}
              setNote={setNote}
            />
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">Draft types</legend>
              <div className="flex flex-wrap gap-2">
                {KINDS.map(({ kind, label, Icon }) => {
                  const on = kinds.includes(kind);
                  return (
                    <button
                      key={kind}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setKinds((prev) => (on ? prev.filter((x) => x !== kind) : [...prev, kind]))
                      }
                      className={cn(
                        'flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-medium',
                        on && 'border-primary bg-accent text-accent-foreground ring-1 ring-primary',
                      )}
                    >
                      <Icon className="size-4" aria-hidden /> {label}
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
            {hint && (
              <p className="text-sm text-muted-foreground" data-testid="ai-hint">
                {hint}
              </p>
            )}
            {gen.isError && (
              <p
                className="rounded-lg border border-destructive/40 p-3 text-sm"
                role="alert"
                data-testid="ai-error"
              >
                {gen.error instanceof ApiRequestError ? gen.error.message : 'Something went wrong.'} Your
                files are kept. You can still write activities by hand.
              </p>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Files are read on this computer; only their text is sent. {AI_PRIVACY_NOTE}
        </p>
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
              disabled={tooShort || tooLong || reading || kinds.length === 0 || gen.isPending}
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

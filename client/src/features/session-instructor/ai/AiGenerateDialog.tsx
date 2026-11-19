import { useState } from 'react';
import { MessageSquareText, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { AI_LIMITS, type AiGenerateKind } from '@getit/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ApiRequestError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { KIND_ICON, KIND_LABEL } from '../activities/kinds';
import { AI_PRIVACY_NOTE, aiApi } from './ai-api';
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
 * "AI generation" (MVP: Prepare from slides): upload slides / notes or paste text, press Generate, and
 * carry on. The server writes the drafts in the background and adds them to the activities list as
 * "AI drafts" (reviewed and confirmed there); this dialog closes at once.
 */
export function AiGenerateDialog({
  code,
  open,
  onOpenChange,
  busy,
}: {
  code: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** A generation is already running for this lecture. */
  busy: boolean;
}) {
  // Kept while the dialog is closed, so reopening doesn't lose uploads or a long paste.
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [pasted, setPasted] = useState('');
  const [note, setNote] = useState('');
  const [count, setCount] = useState<number>(5);
  const [kinds, setKinds] = useState<AiGenerateKind[]>(['MCQ', 'TRUE_FALSE']);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const text = sourceText(files, pasted);
  const reading = files.some((f) => f.text === null && !f.error);
  const tooShort = text.length < AI_LIMITS.slideTextMin;
  const tooLong = text.length > AI_LIMITS.slideTextMax;

  async function generate() {
    setStarting(true);
    setError(null);
    try {
      await aiApi.generate(code, { text, count, kinds, note });
      onOpenChange(false);
      toast.info('Preparing drafts in the background', {
        description: 'Keep teaching — they appear in your activities list as AI drafts.',
      });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    } finally {
      setStarting(false);
    }
  }

  let hint: string | null = null;
  if (busy) hint = 'Drafts are being prepared right now. You can start another set when they are ready.';
  else if (reading) hint = 'Reading your files…';
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
            Upload your slides or notes and press Generate — then carry on. The drafts are written in the
            background and appear in your activities list for you to review. Nothing reaches students until
            you launch it.
          </DialogDescription>
        </DialogHeader>

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
          {error && (
            <p
              className="rounded-lg border border-destructive/40 p-3 text-sm"
              role="alert"
              data-testid="ai-error"
            >
              {error} Your files are kept. You can still write activities by hand.
            </p>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Files are read on this computer; only their text is sent. {AI_PRIVACY_NOTE}
        </p>
        <DialogFooter>
          <Button
            onClick={() => void generate()}
            disabled={tooShort || tooLong || reading || kinds.length === 0 || starting || busy}
            data-testid="ai-generate"
          >
            <Sparkles /> Generate drafts
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

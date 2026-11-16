import { useState, type FormEvent } from 'react';
import { Check, Plus, X } from 'lucide-react';
import {
  ACTIVITY_LIMITS,
  activityTextFixSchema,
  parseNumericAnswer,
  quickCheckDraftSchema,
  type HostActivity,
  type QuickCheckKind,
} from '@getit/shared';
import { Spinner } from '@/components/brand/brand';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { activitiesApi } from './activities-api';
import { KIND_LABEL } from './kinds';

export type EditorTarget = { kind: QuickCheckKind; activity?: HostActivity };

/** Quick Check editor (shot 04). New or DRAFT: everything. Already run: wording only. */
export function ActivityEditorDialog({
  code,
  target,
  onClose,
}: {
  code: string;
  target: EditorTarget | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        {target && (
          <>
            <DialogHeader>
              <DialogTitle>
                {target.activity ? 'Edit' : 'New'} Quick Check · {KIND_LABEL[target.kind]}
              </DialogTitle>
              <DialogDescription>
                {target.activity && target.activity.status !== 'DRAFT'
                  ? 'This activity has been run, so only the wording can change (results stay fair).'
                  : 'Students answer on their phones; the correct answer stays hidden until you reveal it.'}
              </DialogDescription>
            </DialogHeader>
            <EditorForm code={code} target={target} onClose={onClose} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditorForm({ code, target, onClose }: { code: string; target: EditorTarget; onClose: () => void }) {
  const a = target.activity;
  const kind = target.kind;
  const wordingOnly = !!a && a.status !== 'DRAFT';
  const [prompt, setPrompt] = useState(a?.prompt ?? '');
  const [options, setOptions] = useState<string[]>(a?.options.length ? a.options : ['', '']);
  const [correctIndex, setCorrectIndex] = useState<number>(
    typeof a?.correct === 'number' && kind === 'MCQ' ? a.correct : 0,
  );
  const [correctBool, setCorrectBool] = useState<boolean>(typeof a?.correct === 'boolean' ? a.correct : true);
  const [numeric, setNumeric] = useState(
    typeof a?.correct === 'number' && kind === 'NUMERIC' ? String(a.correct) : '',
  );
  const [tolerance, setTolerance] = useState(a?.tolerance != null ? String(a.tolerance) : '0');
  const [explanation, setExplanation] = useState(a?.explanation ?? '');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  function build(): unknown {
    if (wordingOnly) return { prompt, explanation, ...(kind === 'MCQ' ? { options } : {}) };
    if (kind === 'MCQ')
      return { type: 'QUICK_CHECK', kind, prompt, options, correct: correctIndex, explanation };
    if (kind === 'TRUE_FALSE')
      return { type: 'QUICK_CHECK', kind, prompt, correct: correctBool, explanation };
    return {
      type: 'QUICK_CHECK',
      kind,
      prompt,
      correct: parseNumericAnswer(numeric) ?? Number.NaN,
      tolerance: parseNumericAnswer(tolerance) ?? Number.NaN,
      explanation,
    };
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = build();
    const parsed = (wordingOnly ? activityTextFixSchema : quickCheckDraftSchema).safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = String(issue?.path[0] ?? '');
      setError(
        field === 'correct' && kind === 'NUMERIC'
          ? 'Enter the correct number.'
          : field === 'tolerance' && kind === 'NUMERIC' && !issue?.message.includes('negative')
            ? 'Enter a tolerance (0 for exact).'
            : (issue?.message ?? 'Check the form.'),
      );
      return;
    }
    setError(undefined);
    setBusy(true);
    const ok = a
      ? await activitiesApi.edit(a.id, parsed.data)
      : await activitiesApi.create(code, parsed.data as never);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="qc-prompt">Question</Label>
        <Textarea
          id="qc-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          maxLength={ACTIVITY_LIMITS.promptMax}
          rows={3}
          autoFocus
        />
      </div>

      {kind === 'MCQ' && (
        <fieldset className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <legend className="text-sm font-medium">Correct answer</legend>
            {!wordingOnly && (
              <span className="text-xs text-muted-foreground">Tap the circle to mark the correct answer</span>
            )}
          </div>
          {options.map((opt, i) => {
            const letter = String.fromCharCode(65 + i);
            const isCorrect = correctIndex === i;
            return (
              <div
                key={i}
                className={cn(
                  'flex items-center gap-2 rounded-xl border p-1.5 pl-2',
                  isCorrect && 'border-correct bg-correct/10 ring-1 ring-correct',
                )}
              >
                <button
                  type="button"
                  disabled={wordingOnly}
                  onClick={() => setCorrectIndex(i)}
                  aria-pressed={isCorrect}
                  aria-label={`Mark option ${letter} as correct`}
                  className={cn(
                    'grid size-8 shrink-0 place-items-center rounded-full border-2',
                    isCorrect ? 'border-correct bg-correct text-white' : 'border-input',
                  )}
                >
                  {isCorrect && <Check className="size-4" />}
                </button>
                <span className="w-4 text-sm font-semibold text-muted-foreground">{letter}</span>
                <Input
                  aria-label={`Option ${letter}`}
                  value={opt}
                  onChange={(e) => setOptions(options.map((o, j) => (j === i ? e.target.value : o)))}
                  maxLength={ACTIVITY_LIMITS.optionMax}
                  className="h-10 border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
                />
                {!wordingOnly && options.length > ACTIVITY_LIMITS.optionsMin && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove option ${letter}`}
                    onClick={() => {
                      setOptions(options.filter((_, j) => j !== i));
                      setCorrectIndex((c) => (c === i ? 0 : c > i ? c - 1 : c));
                    }}
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </div>
            );
          })}
          {!wordingOnly && options.length < ACTIVITY_LIMITS.optionsMax && (
            <button
              type="button"
              onClick={() => setOptions([...options, ''])}
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-dashed text-sm font-medium text-primary hover:bg-accent"
            >
              <Plus className="size-4" /> Add option
            </button>
          )}
        </fieldset>
      )}

      {kind === 'TRUE_FALSE' && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Correct answer</legend>
          <div className="grid grid-cols-2 gap-2">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                type="button"
                disabled={wordingOnly}
                onClick={() => setCorrectBool(v)}
                aria-pressed={correctBool === v}
                className={cn(
                  'flex min-h-12 items-center justify-center gap-2 rounded-xl border font-medium',
                  correctBool === v && 'border-correct bg-correct/10 text-correct ring-1 ring-correct',
                )}
              >
                {correctBool === v && <Check className="size-4" />} {v ? 'True' : 'False'}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {kind === 'NUMERIC' && (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="qc-correct">Correct answer</Label>
            <Input
              id="qc-correct"
              inputMode="decimal"
              value={numeric}
              onChange={(e) => setNumeric(e.target.value)}
              disabled={wordingOnly}
              placeholder="e.g. 43.04"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="qc-tolerance">Tolerance (±)</Label>
            <Input
              id="qc-tolerance"
              inputMode="decimal"
              value={tolerance}
              onChange={(e) => setTolerance(e.target.value)}
              disabled={wordingOnly}
              placeholder="0 = exact"
            />
          </div>
          <p className="col-span-2 -mt-1 text-xs text-muted-foreground">
            An answer counts as correct if it is within the tolerance, e.g. 43.04 ± 0.1.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="qc-explanation">Explanation</Label>
          <span className="text-xs text-muted-foreground">Shown to students when you reveal the answer.</span>
        </div>
        <Textarea
          id="qc-explanation"
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          maxLength={ACTIVITY_LIMITS.explanationMax}
          rows={2}
        />
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={busy}>
        {busy && <Spinner decorative />} Save activity
      </Button>
    </form>
  );
}

import { useState, type FormEvent } from 'react';
import { ACTIVITY_LIMITS, explainDraftSchema, explainTextFixSchema, type HostActivity } from '@getit/shared';
import { Spinner } from '@/components/brand/brand';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { activitiesApi } from './activities-api';

/** Spec C3: Prompt + Model answer (never sent to students). */
export function ExplainEditorDialog({
  code,
  target,
  onClose,
}: {
  code: string;
  target: { activity?: HostActivity } | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        {target && (
          <>
            <DialogHeader>
              <DialogTitle>{target.activity ? 'Edit' : 'New'} Explain</DialogTitle>
              <DialogDescription>
                Students explain an idea in their own words (up to 200 characters). You read and tag the
                answers after closing.
              </DialogDescription>
            </DialogHeader>
            <ExplainForm code={code} activity={target.activity} onClose={onClose} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ExplainForm({
  code,
  activity,
  onClose,
}: {
  code: string;
  activity?: HostActivity | undefined;
  onClose: () => void;
}) {
  const [prompt, setPrompt] = useState(activity?.prompt ?? '');
  const [modelAnswer, setModelAnswer] = useState(activity?.modelAnswer ?? '');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = activity
      ? explainTextFixSchema.safeParse({ prompt, modelAnswer })
      : explainDraftSchema.safeParse({ type: 'EXPLAIN', prompt, modelAnswer });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    setError(undefined);
    setBusy(true);
    const ok = activity
      ? await activitiesApi.edit(activity.id, parsed.data)
      : await activitiesApi.create(code, parsed.data as never);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="ex-prompt">Prompt</Label>
        <Textarea
          id="ex-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          maxLength={ACTIVITY_LIMITS.promptMax}
          rows={3}
          autoFocus
          placeholder="e.g. In one sentence: what does the slope b tell you that r doesn't?"
        />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="ex-model">Model answer</Label>
          <span className="text-xs text-muted-foreground">Only you see it. Optional.</span>
        </div>
        <Textarea
          id="ex-model"
          value={modelAnswer}
          onChange={(e) => setModelAnswer(e.target.value)}
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

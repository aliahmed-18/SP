import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, CircleCheck, Plus, Send, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { TAKEAWAY_LIMITS, takeawaySaveSchema, type TakeawayDraft } from '@getit/shared';
import { Spinner } from '@/components/brand/brand';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiRequestError } from '@/lib/api';
import { cn } from '@/lib/utils';

const until = new Intl.DateTimeFormat('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit' });

/** Spec F (shot 09): key points, top topics (auto-filled by Me too, missing replies fillable), Save / Publish. */
export function TakeawayEditor({ code, endedAt }: { code: string; endedAt: string | null }) {
  const draft = useQuery({
    queryKey: ['takeaway-draft', code],
    queryFn: () => api<TakeawayDraft>(`/sessions/${code}/takeaway/draft`),
    // The form holds unsaved edits: never refetch behind the instructor's back (window focus etc.).
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  if (draft.isPending) {
    return (
      <div className="flex justify-center rounded-2xl border p-8">
        <Spinner label="Loading the Take-away" className="!size-8" />
      </div>
    );
  }
  if (draft.isError) {
    return (
      <div className="rounded-2xl border p-6 text-center">
        <p className="mb-3">Couldn't load the Take-away.</p>
        <Button onClick={() => void draft.refetch()}>Retry</Button>
      </div>
    );
  }
  return <EditorForm key={draft.data.status} code={code} draft={draft.data} endedAt={endedAt} />;
}

function EditorForm({
  code,
  draft,
  endedAt,
}: {
  code: string;
  draft: TakeawayDraft;
  endedAt: string | null;
}) {
  const qc = useQueryClient();
  const [points, setPoints] = useState<string[]>(draft.keyPoints.length ? draft.keyPoints : ['']);
  const [chosen, setChosen] = useState<Set<string>>(new Set(draft.topTopicIds));
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const published = draft.status === 'PUBLISHED';

  const body = () => ({
    keyPoints: points.map((p) => p.trim()).filter(Boolean),
    topTopicIds: draft.topics.filter((t) => chosen.has(t.id)).map((t) => t.id),
    replies: Object.fromEntries(Object.entries(replies).filter(([, v]) => v.trim())),
  });

  const save = useMutation({
    mutationFn: async (publish: boolean) => {
      const parsed = takeawaySaveSchema.safeParse(body());
      if (!parsed.success)
        throw new ApiRequestError(400, 'VALIDATION', parsed.error.issues[0]?.message ?? 'Check the form.');
      if (publish && parsed.data.keyPoints.length === 0) {
        throw new ApiRequestError(400, 'VALIDATION', 'Add at least one key point before publishing.');
      }
      await api(`/sessions/${code}/takeaway`, { method: 'PUT', body: JSON.stringify(parsed.data) });
      if (publish) await api(`/sessions/${code}/takeaway/publish`, { method: 'POST' });
    },
    onSuccess: async (_d, publish) => {
      setError(undefined);
      toast.success(
        publish
          ? 'Take-away published — students can see it now'
          : published
            ? 'Take-away updated'
            : 'Draft saved',
      );
      await qc.invalidateQueries({ queryKey: ['takeaway-draft', code] });
    },
    onError: (err) => setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.'),
  });

  const move = (i: number, d: -1 | 1) => {
    const next = [...points];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    setPoints(next);
  };

  return (
    <section
      aria-labelledby="takeaway-title"
      className="flex flex-col gap-5 rounded-2xl border bg-card p-5"
      data-testid="takeaway-editor"
    >
      <header className="flex flex-wrap items-center gap-2">
        <h2 id="takeaway-title" className="flex-1 text-xl font-semibold">
          Take-away
        </h2>
        {published ? (
          <Badge variant="accent">
            <CircleCheck aria-hidden /> Published
            {endedAt && ` · visible until ${until.format(new Date(Date.parse(endedAt) + 24 * 3600 * 1000))}`}
          </Badge>
        ) : (
          <Badge variant="secondary">Draft</Badge>
        )}
      </header>
      <p className="-mt-3 text-sm text-muted-foreground">The summary students receive after the lecture.</p>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-medium">Today's key points</legend>
        {points.map((p, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
              {i + 1}
            </span>
            <Input
              aria-label={`Key point ${i + 1}`}
              value={p}
              onChange={(e) => setPoints(points.map((x, j) => (j === i ? e.target.value : x)))}
              maxLength={TAKEAWAY_LIMITS.keyPointMax}
              placeholder={
                i === 0 ? 'e.g. The slope b is the change in y for each one-unit increase in x.' : ''
              }
              dir="auto"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Move key point ${i + 1} up`}
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              <ArrowUp className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Move key point ${i + 1} down`}
              disabled={i === points.length - 1}
              onClick={() => move(i, 1)}
            >
              <ArrowDown className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove key point ${i + 1}`}
              onClick={() => setPoints(points.length > 1 ? points.filter((_, j) => j !== i) : [''])}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        {points.length < TAKEAWAY_LIMITS.keyPoints && (
          <button
            type="button"
            onClick={() => setPoints([...points, ''])}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-dashed text-sm font-medium text-primary hover:bg-accent"
          >
            <Plus className="size-4" /> Add key point
          </button>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">What the class asked most</legend>
        <p className="mb-1 text-sm text-muted-foreground">
          Topics with the most “Me too”, with your replies. Untick to leave one out.
        </p>
        {draft.topics.length === 0 && (
          <p className="text-sm text-muted-foreground">No topics in this session.</p>
        )}
        {draft.topics.map((t) => {
          const on = chosen.has(t.id);
          return (
            <div key={t.id} className={cn('rounded-xl border p-3', on && 'border-primary/40 bg-accent/40')}>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 size-5 accent-primary"
                  checked={on}
                  onChange={(e) => {
                    const next = new Set(chosen);
                    if (e.target.checked) next.add(t.id);
                    else next.delete(t.id);
                    setChosen(next);
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium" dir="auto">
                    {t.title}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="size-3.5" aria-hidden /> {t.meTooCount} Me too · {t.questionCount} asked
                    {t.status === 'ANSWERED_IN_CLASS' && ' · Answered in class'}
                  </span>
                </span>
              </label>
              {on && t.reply && (
                <p className="mt-2 ml-8 rounded-lg bg-card p-2 text-sm" dir="auto">
                  {t.reply}
                </p>
              )}
              {on && !t.reply && (
                <Textarea
                  aria-label={`Written reply for ${t.title}`}
                  className="mt-2 ml-8 w-[calc(100%-2rem)] text-sm"
                  rows={2}
                  maxLength={2000}
                  placeholder={
                    t.status === 'ANSWERED_IN_CLASS'
                      ? 'Answered in class. Add a short written reply too (optional).'
                      : 'Not answered yet. Add a short written reply (optional).'
                  }
                  value={replies[t.id] ?? ''}
                  onChange={(e) => setReplies({ ...replies, [t.id]: e.target.value })}
                />
              )}
            </div>
          );
        })}
      </fieldset>

      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {!published && (
          <Button variant="outline" onClick={() => save.mutate(false)} disabled={save.isPending}>
            Save draft
          </Button>
        )}
        <Button onClick={() => save.mutate(true)} disabled={save.isPending}>
          {save.isPending ? <Spinner decorative /> : <Send />} {published ? 'Update for students' : 'Publish'}
        </Button>
      </div>
    </section>
  );
}

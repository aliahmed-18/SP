import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, Check, Lock, MessageSquareText, Send } from 'lucide-react';
import { toast } from 'sonner';
import { EXPLAIN_MAX, type MyResponse, type StudentActivity } from '@getit/shared';
import { Spinner } from '@/components/brand/brand';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { GetitSocket } from '@/lib/socket';

/** Explain on the phone (spec E): ≤ 200 characters, one answer, quiet "Answer sent". */
export function ExplainView({
  activity: a,
  mine,
  getSocket,
  onMine,
  onBack,
}: {
  activity: StudentActivity;
  mine: MyResponse | null;
  getSocket: () => GetitSocket | null;
  onMine: (m: MyResponse) => void;
  onBack: () => void;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const length = [...text.trim()].length;

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [a.id, a.status]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!length || length > EXPLAIN_MAX || sending) return;
    const socket = getSocket();
    if (!socket?.connected)
      return toast.error("You're offline. Your answer is still here — try again in a moment.");
    setSending(true);
    try {
      const res = await socket.timeout(8000).emitWithAck('explain:submit', { activityId: a.id, text });
      if (res.ok) onMine(res.data);
      else toast.error(res.error.message);
    } catch {
      toast.error("Couldn't send. Check your connection — your answer is still here.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="fade-in flex flex-col gap-5" aria-labelledby="ex-prompt" data-testid="explain-view">
      <p className="flex items-center gap-2 text-muted-foreground">
        <MessageSquareText className="size-5" aria-hidden /> Explain in your own words
      </p>
      <h1 id="ex-prompt" className="text-3xl leading-tight font-bold break-words" dir="auto">
        {a.prompt}
      </h1>

      {mine ? (
        <div className="flex items-start gap-3 rounded-2xl border bg-card p-5" role="status">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-primary">
            <Check className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-lg font-semibold">Answer sent</p>
            <p className="text-muted-foreground">Thanks! The instructor reads the answers without names.</p>
          </div>
        </div>
      ) : a.status === 'LIVE' ? (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
          <Textarea
            aria-label="Your answer"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Your answer…"
            rows={6}
            dir="auto"
            className="max-h-[50dvh] min-h-36 text-base"
            aria-invalid={length > EXPLAIN_MAX ? true : undefined}
            aria-describedby="ex-count"
          />
          <p
            id="ex-count"
            className={
              length > EXPLAIN_MAX
                ? 'text-right text-sm text-destructive'
                : 'text-right text-sm text-muted-foreground'
            }
          >
            {length} / {EXPLAIN_MAX}
          </p>
          <Button
            type="submit"
            size="lg"
            className="h-14 text-lg"
            disabled={!length || length > EXPLAIN_MAX || sending}
          >
            {sending ? <Spinner decorative /> : <Send />} Send
          </Button>
        </form>
      ) : (
        <p
          className="flex items-center gap-2 rounded-2xl border bg-card p-4 text-muted-foreground"
          role="status"
        >
          <Lock className="size-5" aria-hidden /> Answering is closed.
        </p>
      )}

      {a.status !== 'LIVE' && (
        <Button variant="outline" size="lg" className="mt-2 h-14 text-base" onClick={onBack}>
          <ArrowLeft /> Back to the lecture
        </Button>
      )}
    </section>
  );
}

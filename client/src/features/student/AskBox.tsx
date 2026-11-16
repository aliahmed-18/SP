import { useEffect, useState, type FormEvent } from 'react';
import { Lock, Send } from 'lucide-react';
import { toast } from 'sonner';
import { LIMITS } from '@getit/shared';
import { Spinner } from '@/components/brand/brand';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { addMyQuestion, getDraft, setDraft, type MyQuestion } from '@/lib/local-history';
import type { GetitSocket } from '@/lib/socket';

/**
 * "Your question" card (shot 20). The draft lives in sessionStorage. The phone enforces the 5 s gap and
 * the 40-question limit itself, so an honest student never hits the server's silent drop (rule 6).
 */
export function AskBox({
  sessionId,
  getSocket,
  online,
  sentCount,
  onSent,
}: {
  sessionId: string;
  getSocket: () => GetitSocket | null;
  online: boolean;
  sentCount: number;
  onSent: (mine: MyQuestion[]) => void;
}) {
  const [text, setText] = useState(() => getDraft(sessionId));
  const [sending, setSending] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => setDraft(sessionId, text), [sessionId, text]);
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [cooldownUntil]);

  const length = [...text.trim()].length;
  const tooLong = length > LIMITS.questionMax;
  const limitReached = sentCount >= LIMITS.questionsPerDevice;
  const waitS = Math.ceil(Math.max(0, cooldownUntil - now) / 1000);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const socket = getSocket();
    if (!length || tooLong || sending || waitS > 0 || limitReached) return;
    if (!socket?.connected) {
      toast.error("You're offline. Your question is saved — send it when you're back.");
      return;
    }
    setSending(true);
    try {
      const res = await socket.timeout(8000).emitWithAck('question:ask', { text });
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      onSent(addMyQuestion(sessionId, { text: text.trim().replace(/\s+/g, ' '), sentAt: res.data.sentAt }));
      setText('');
      setCooldownUntil(Date.now() + LIMITS.questionMinGapMs);
      setNow(Date.now());
      toast.success('Question sent');
    } catch {
      toast.error("Couldn't send. Check your connection — your question is still here.");
    } finally {
      setSending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border bg-card p-5 shadow-xs"
      aria-labelledby="ask-title"
    >
      <h2 id="ask-title" className="text-lg font-semibold">
        Your question
      </h2>
      <p className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
        <Lock className="size-4" aria-hidden /> Anonymous — your name is never shown.
      </p>
      <Textarea
        aria-label="Your question"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ask anything about the lecture…"
        rows={4}
        className="min-h-28 text-base"
        aria-invalid={tooLong ? true : undefined}
        aria-describedby="ask-count"
        disabled={limitReached}
      />
      <p
        id="ask-count"
        className={
          tooLong
            ? 'mt-1 text-right text-sm text-destructive'
            : 'mt-1 text-right text-sm text-muted-foreground'
        }
      >
        {length} / {LIMITS.questionMax}
      </p>
      {limitReached ? (
        <p className="mt-3 rounded-lg bg-muted p-3 text-sm">
          You've reached the question limit for this lecture.
        </p>
      ) : (
        <Button
          type="submit"
          size="lg"
          className="mt-3 h-12 w-full text-base"
          disabled={!length || tooLong || sending || waitS > 0}
        >
          {sending ? <Spinner decorative /> : <Send />}
          {waitS > 0 ? `Sent — next in ${waitS}s` : 'Send'}
        </Button>
      )}
      {!online && !limitReached && (
        <p className="mt-2 text-center text-sm text-muted-foreground">Reconnecting… your draft is kept.</p>
      )}
    </form>
  );
}

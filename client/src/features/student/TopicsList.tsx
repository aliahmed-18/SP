import { Check, CircleCheck } from 'lucide-react';
import { toast } from 'sonner';
import type { StudentTopic } from '@getit/shared';
import { cn } from '@/lib/utils';
import type { GetitSocket } from '@/lib/socket';

/** "Topics the class is asking about" (shot 20) with Me too (one per phone, can undo) and replies. */
export function TopicsList({
  topics,
  getSocket,
  canMeToo,
  applyMeToo,
}: {
  topics: StudentTopic[];
  getSocket: () => GetitSocket | null;
  canMeToo: boolean;
  applyMeToo: (topicId: string, on: boolean, meTooCount?: number) => void;
}) {
  if (topics.length === 0) return null;

  async function toggle(t: StudentTopic) {
    const socket = getSocket();
    if (!socket?.connected) return toast.error("You're offline. Try again in a moment.");
    const on = !t.iMeToo;
    applyMeToo(t.id, on); // optimistic
    try {
      const res = await socket.timeout(8000).emitWithAck('topic:metoo', { topicId: t.id, on });
      if (res.ok) applyMeToo(t.id, res.data.on, res.data.meTooCount);
      else {
        applyMeToo(t.id, !on);
        toast.error(res.error.message);
      }
    } catch {
      applyMeToo(t.id, !on);
      toast.error("Couldn't save. Check your connection.");
    }
  }

  return (
    <section aria-labelledby="topics-title" className="flex flex-col gap-3">
      <div>
        <h2 id="topics-title" className="text-xl font-semibold">
          Topics the class is asking about
        </h2>
        {canMeToo && <p className="text-muted-foreground">Tap “Me too” if you have the same question.</p>}
      </div>
      <ul className="flex flex-col gap-3">
        {topics.map((t) => (
          <li key={t.id} className="fade-in rounded-2xl border bg-card p-4" data-testid="student-topic">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1 pt-1">
                <h3 className="text-lg font-semibold break-words" dir="auto">
                  {t.title}
                </h3>
                {t.status === 'REPLIED' && (
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-sm font-medium text-accent-foreground">
                    <Check className="size-4" aria-hidden /> Replied
                  </span>
                )}
                {t.status === 'ANSWERED_IN_CLASS' && (
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-sm font-medium text-accent-foreground">
                    <CircleCheck className="size-4" aria-hidden /> Answered in class
                  </span>
                )}
              </div>
              {canMeToo ? (
                <button
                  type="button"
                  onClick={() => void toggle(t)}
                  aria-pressed={t.iMeToo}
                  className={cn(
                    'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 font-medium transition-colors',
                    t.iMeToo
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  {t.iMeToo && <Check className="size-4" aria-hidden />}
                  Me too <span className="font-semibold">{t.meTooCount}</span>
                </button>
              ) : (
                <span className="shrink-0 pt-1 text-sm text-muted-foreground">{t.meTooCount} Me too</span>
              )}
            </div>
            {t.status === 'REPLIED' && t.reply && (
              <p
                className="mt-3 rounded-xl bg-accent p-3 break-words whitespace-pre-wrap text-accent-foreground"
                dir="auto"
              >
                {t.reply}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

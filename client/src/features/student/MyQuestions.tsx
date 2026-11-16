import { ChevronDown } from 'lucide-react';
import type { MyQuestion } from '@/lib/local-history';
import { formatTime } from '@/lib/format';

/** "My questions (n)" — only on this phone (never from the server: stealth moderation). */
export function MyQuestions({ questions }: { questions: MyQuestion[] }) {
  return (
    <details className="group rounded-2xl" data-testid="my-questions">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-xl px-2 text-lg font-medium">
        My questions ({questions.length})
        <ChevronDown className="size-5 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      {questions.length === 0 ? (
        <p className="px-2 pb-2 text-muted-foreground">You haven't asked anything yet.</p>
      ) : (
        <ul className="flex flex-col gap-2 pt-1">
          {questions.map((q) => (
            <li key={q.sentAt + q.text} className="rounded-xl border bg-card px-4 py-3">
              <p className="break-words" dir="auto">
                {q.text}
              </p>
              <time className="text-xs text-muted-foreground" dateTime={q.sentAt}>
                {formatTime(q.sentAt)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

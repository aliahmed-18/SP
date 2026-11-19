import { CircleCheck, MessageSquareText, Users } from 'lucide-react';
import type { ProjectedTopic } from '@getit/shared';
import { cn } from '@/lib/utils';

/** A Q&A topic pushed from the host: anonymous questions + the reply. */
export function TopicScreen({ topic }: { topic: ProjectedTopic }) {
  return (
    <section className="run-step flex w-full max-w-6xl flex-col gap-6" aria-labelledby="projected-topic">
      <p className="text-2xl font-semibold text-primary">Question from the class</p>
      <h1 id="projected-topic" className="text-6xl leading-tight font-bold" dir="auto">
        {topic.title}
      </h1>
      <p className="flex items-center gap-3 text-2xl text-muted-foreground">
        <Users className="size-7" aria-hidden /> {topic.questions.length} asked · {topic.meTooCount} tapped
        “Me too”
      </p>
      <ul className="flex flex-col gap-3">
        {topic.questions.slice(0, 5).map((q, i) => (
          <li key={i} className="rounded-2xl bg-muted px-6 py-4 text-3xl" dir="auto">
            {q}
          </li>
        ))}
      </ul>
      {topic.reply && (
        <p className="flex gap-4 rounded-2xl bg-accent p-6 text-3xl text-accent-foreground" dir="auto">
          <CircleCheck className="mt-1 size-8 shrink-0" aria-hidden /> {topic.reply}
        </p>
      )}
    </section>
  );
}

export function WrapScreen({ activities, joined }: { activities: number; joined: number }) {
  return (
    <section className="run-step text-center">
      <h1 className="text-7xl font-bold">That’s a wrap</h1>
      <p className="mt-6 text-3xl text-muted-foreground">
        Activities: {activities} · Joined: {joined}
      </p>
      <p className="mt-4 text-2xl text-muted-foreground">
        Keep asking on your phone — questions stay open until the end.
      </p>
    </section>
  );
}

export function EndedScreen() {
  return (
    <div className="run-step text-center">
      <p className="text-3xl text-muted-foreground">Thank you!</p>
      <h1 className="text-7xl font-bold">The lecture has ended</h1>
    </div>
  );
}

/** Explain, closed: no answer texts on the projector (only a misconception the host chooses to show). */
export function AnswersCollected({ prompt, count }: { prompt: string; count: number }) {
  return (
    <section className="run-step flex w-full max-w-6xl flex-col gap-6 text-center">
      <MessageSquareText className="mx-auto size-16 text-primary" aria-hidden />
      <h1 className="text-5xl leading-tight font-bold" dir="auto">
        {prompt}
      </h1>
      <p className="text-4xl text-muted-foreground">
        Answers collected: <strong className="text-foreground">{count}</strong>
      </p>
    </section>
  );
}

/** One anonymous answer tagged as a misconception, to discuss with the class (spec C3). */
export function MisconceptionScreen({ prompt, text }: { prompt: string; text: string }) {
  return (
    <section className="run-step flex w-full max-w-6xl flex-col gap-8" aria-labelledby="misconception">
      <p className="text-2xl font-semibold text-attention-foreground dark:text-attention">
        Let's discuss this answer
      </p>
      <p className="text-3xl text-muted-foreground" dir="auto">
        {prompt}
      </p>
      <blockquote
        id="misconception"
        className={cn(
          'rounded-3xl border-l-8 border-attention bg-attention/10 p-10 leading-snug font-semibold',
          // Longer answers (up to 1000 characters) stay readable and on one screen.
          text.length > 400 ? 'text-2xl' : text.length > 160 ? 'text-3xl' : 'text-5xl',
        )}
        dir="auto"
      >
        “{text}”
      </blockquote>
      <p className="text-2xl text-muted-foreground">Anonymous — what would you change?</p>
    </section>
  );
}

import { CircleCheck, Users } from 'lucide-react';
import type { ProjectedTopic } from '@getit/shared';

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

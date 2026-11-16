import type { ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';

export function ErrorState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center"
      role="alert"
    >
      <span className="grid size-12 place-items-center rounded-full bg-accent text-primary">
        <CircleAlert className="size-6" aria-hidden />
      </span>
      <h1 className="text-xl font-semibold">{title}</h1>
      {body && <p className="max-w-sm text-muted-foreground">{body}</p>}
      {action}
    </div>
  );
}

import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export type OptionTone = 'idle' | 'selected' | 'correct' | 'wrong' | 'muted';

/** Full-width answer card with a letter badge (shots 21–25). */
export function OptionCard({
  letter,
  label,
  tone,
  note,
  onClick,
  disabled,
}: {
  letter: string;
  label: string;
  tone: OptionTone;
  note?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const body = (
    <>
      <span
        className={cn(
          'grid size-11 shrink-0 place-items-center rounded-xl text-lg font-semibold',
          tone === 'selected' && 'bg-primary text-primary-foreground',
          tone === 'correct' && 'bg-correct text-white',
          tone === 'wrong' && 'bg-wrong text-white',
          (tone === 'idle' || tone === 'muted') && 'bg-muted',
        )}
        aria-hidden
      >
        {tone === 'correct' ? <Check className="size-6" /> : letter}
      </span>
      <span
        className={cn('min-w-0 flex-1 text-lg break-words', tone === 'muted' && 'text-muted-foreground')}
        dir="auto"
      >
        {label}
      </span>
      {note}
      {tone === 'selected' && (
        <span
          className="grid size-6 shrink-0 place-items-center rounded-full border-2 border-primary"
          aria-hidden
        >
          <span className="size-3 rounded-full bg-primary" />
        </span>
      )}
    </>
  );
  const cls = cn(
    'flex min-h-16 w-full items-center gap-4 rounded-2xl border bg-card p-3 text-left transition-colors',
    tone === 'selected' && 'border-primary bg-accent ring-1 ring-primary',
    tone === 'correct' && 'border-correct bg-correct/10 ring-1 ring-correct',
    tone === 'wrong' && 'border-wrong bg-wrong/10',
  );
  if (!onClick) return <div className={cls}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(cls, 'enabled:hover:bg-accent/60')}
    >
      {body}
    </button>
  );
}

import { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type { MyQuestion } from '@/lib/local-history';
import type { GetitSocket } from '@/lib/socket';
import { AskBox } from './AskBox';

/** While an activity is on screen: floating "Ask" button → bottom sheet with the ask box (shot 27). */
export function AskSheet(props: {
  sessionId: string;
  getSocket: () => GetitSocket | null;
  online: boolean;
  sentCount: number;
  onSent: (mine: MyQuestion[]) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 inline-flex h-14 items-center gap-2 rounded-full bg-primary px-6 text-lg font-semibold text-primary-foreground shadow-lg"
        >
          <MessageSquarePlus className="size-6" aria-hidden /> Ask
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="classroom-overlay fade-in fixed inset-0 z-50" />
        <DialogPrimitive.Content className="fade-in fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[90dvh] max-w-xl overflow-y-auto rounded-t-3xl border bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl">
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-muted" aria-hidden />
          <DialogPrimitive.Title className="mb-1 text-lg font-semibold">Ask a question</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Your question goes to the instructor anonymously.
          </DialogPrimitive.Description>
          <AskBox
            {...props}
            bare
            onSent={(m) => {
              props.onSent(m);
              setOpen(false);
            }}
          />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

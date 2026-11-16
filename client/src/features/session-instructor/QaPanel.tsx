import { MessageCircleQuestion, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Right side panel (shot 03). Phase 2: empty state only; questions + topics arrive in Phase 3. */
export function QaPanel({ onShowQr, ended }: { onShowQr: () => void; ended: boolean }) {
  return (
    <aside aria-labelledby="qa-title" className="rounded-2xl border bg-card lg:sticky lg:top-6">
      <div className="border-b p-5">
        <h2 id="qa-title" className="text-lg font-semibold">
          Q&amp;A
        </h2>
        <p className="text-sm text-muted-foreground">0 questions</p>
      </div>
      <div className="p-5">
        <div className="flex flex-col items-center gap-3 rounded-xl border p-8 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-accent text-primary">
            <MessageCircleQuestion className="size-6" aria-hidden />
          </span>
          <p className="font-semibold">No questions yet</p>
          <p className="text-sm text-muted-foreground">
            {ended
              ? 'Nobody asked a question in this session.'
              : 'They appear here as students send them. Show the join code so the class can join.'}
          </p>
          {!ended && (
            <Button variant="outline" onClick={onShowQr}>
              <QrCode /> Show join code
            </Button>
          )}
        </div>
      </div>
    </aside>
  );
}

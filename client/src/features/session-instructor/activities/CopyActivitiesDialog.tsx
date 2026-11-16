import { useQuery } from '@tanstack/react-query';
import type { SessionListItem } from '@getit/shared';
import { Spinner } from '@/components/brand/brand';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { activitiesApi } from './activities-api';

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** Reuse activities from an earlier lecture (incl. the seeded demo templates). */
export function CopyActivitiesDialog({
  code,
  sessionId,
  open,
  onOpenChange,
}: {
  code: string;
  sessionId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api<SessionListItem[]>('/sessions'),
    enabled: open,
  });
  const candidates = (sessions.data ?? []).filter((s) => s.id !== sessionId && s.activities > 0);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copy from an earlier session</DialogTitle>
          <DialogDescription>The activities are added as drafts at the end of your list.</DialogDescription>
        </DialogHeader>
        {sessions.isPending ? (
          <div className="flex justify-center p-6">
            <Spinner label="Loading sessions" className="!size-8" />
          </div>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">None of your earlier sessions has activities yet.</p>
        ) : (
          <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
            {candidates.map((s) => (
              <li key={s.id}>
                <Button
                  variant="outline"
                  className="h-auto w-full justify-between py-3 text-left whitespace-normal"
                  onClick={async () => {
                    if (await activitiesApi.copyFrom(code, s.id)) onOpenChange(false);
                  }}
                >
                  <span className="min-w-0">
                    <span className="block font-medium" dir="auto">
                      {s.topic}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {dateFmt.format(new Date(s.startedAt))}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm text-muted-foreground">
                    {s.activities} {s.activities === 1 ? 'activity' : 'activities'}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

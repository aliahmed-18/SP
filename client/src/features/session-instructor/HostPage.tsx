import { useState } from 'react';
import { CircleStop, ListChecks, Play, Plus } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { normalizeJoinCode, type HostState } from '@getit/shared';
import { LoadingState } from '@/components/brand/brand';
import { AppHeader } from '@/components/layout/AppHeader';
import { ErrorState } from '@/components/layout/ErrorState';
import { ReconnectingBanner } from '@/components/layout/ReconnectingBanner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { UserMenu } from '@/features/auth/UserMenu';
import { api, ApiRequestError } from '@/lib/api';
import { openPresentWindow } from '@/lib/links';
import { EndSessionDialog } from './EndSessionDialog';
import { InviteCard } from './InviteCard';
import { QaPanel } from './QaPanel';
import { QrDialog } from './QrDialog';
import { useHostState } from './use-host-state';

export function HostPage() {
  const code = normalizeJoinCode(useParams().code ?? '');
  const { state, setState, status, refusal } = useHostState(code);
  const [qrOpen, setQrOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  if (status === 'refused') {
    return (
      <ErrorState
        title={
          refusal === 'FORBIDDEN' ? 'This session belongs to another account' : "That session doesn't exist"
        }
        body="Check the link, or open the session from your dashboard."
        action={
          <Button asChild>
            <Link to="/dashboard">Go to dashboard</Link>
          </Button>
        }
      />
    );
  }
  if (!state) return <LoadingState text="Opening your session…" />;

  const { session } = state;
  const ended = session.status === 'ENDED';

  async function endSession() {
    try {
      setState(await api<HostState>(`/sessions/${code}/end`, { method: 'POST' }));
      toast.success('Session ended');
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Couldn't end the session. Try again.");
    }
  }

  return (
    <div className="min-h-dvh">
      <ReconnectingBanner status={status} />
      <AppHeader
        left={
          ended ? (
            <Badge variant="secondary" className="text-sm">
              <CircleStop aria-hidden /> Ended
            </Badge>
          ) : undefined
        }
        right={
          <UserMenu>
            {!ended && (
              <DropdownMenuItem variant="destructive" onSelect={() => setEndOpen(true)}>
                <CircleStop /> End session
              </DropdownMenuItem>
            )}
          </UserMenu>
        }
      />

      {ended && (
        <div className="border-b bg-muted">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
            <p className="flex-1 text-sm">
              <strong>Ended.</strong> Students now see that the lecture has ended. This session stays in your
              dashboard.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to="/dashboard">
                <Plus /> Start a new session
              </Link>
            </Button>
          </div>
        </div>
      )}

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          <h1 className="text-2xl font-semibold sm:text-3xl" dir="auto">
            <span className="font-normal text-muted-foreground">Topic: </span>
            {session.topic}
          </h1>

          {!ended && (
            <InviteCard
              code={session.code}
              joinedCount={session.joinedCount}
              onShowQr={() => setQrOpen(true)}
            />
          )}

          <section aria-labelledby="activities-title" className="flex flex-col gap-3">
            <h2 id="activities-title" className="text-xl font-semibold">
              Activities list
            </h2>
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed p-10 text-center">
              <ListChecks className="size-6 text-primary" aria-hidden />
              <p className="font-medium">No activity added yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Quick Checks and Explain prompts you add will appear here in run order.
              </p>
            </div>
          </section>

          {!ended && (
            <div className="flex flex-col items-center gap-2">
              <Button
                size="lg"
                className="h-14 w-full text-lg"
                onClick={() => openPresentWindow(session.code)}
              >
                <Play /> Start presenting
              </Button>
              <p className="text-sm text-muted-foreground">
                Opens the projector screen with the QR and join code.
              </p>
            </div>
          )}

          {ended && (
            <p className="text-sm text-muted-foreground">
              {session.joinedCount} {session.joinedCount === 1 ? 'student' : 'students'} joined this session.
            </p>
          )}
        </div>

        <QaPanel onShowQr={() => setQrOpen(true)} ended={ended} />
      </main>

      <QrDialog code={session.code} open={qrOpen} onOpenChange={setQrOpen} />
      <EndSessionDialog open={endOpen} onOpenChange={setEndOpen} onConfirm={() => void endSession()} />
    </div>
  );
}

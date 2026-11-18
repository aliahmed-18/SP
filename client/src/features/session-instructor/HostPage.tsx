import { useState } from 'react';
import {
  ChevronDown,
  CircleStop,
  Download,
  FileSpreadsheet,
  FileText,
  LayoutList,
  MessagesSquare,
  Play,
  Plus,
} from 'lucide-react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { normalizeJoinCode, type HostState } from '@getit/shared';
import { LoadingState } from '@/components/brand/brand';
import { AppHeader } from '@/components/layout/AppHeader';
import { ErrorState } from '@/components/layout/ErrorState';
import { ReconnectingBanner } from '@/components/layout/ReconnectingBanner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserMenu } from '@/features/auth/UserMenu';
import { TakeawayEditor } from '@/features/takeaway/TakeawayEditor';
import { api, ApiRequestError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { openPresentWindow } from '@/lib/links';
import { ActivitiesSection } from './activities/ActivitiesSection';
import { EndSessionDialog } from './EndSessionDialog';
import { HostContext } from './host-context';
import { InviteCard } from './InviteCard';
import { QaPanel } from './QaPanel';
import { QrDialog } from './QrDialog';
import { useHostState } from './use-host-state';

export function HostPage() {
  const code = normalizeJoinCode(useParams().code ?? '');
  const { state, setState, status, refusal, liveStats, getSocket } = useHostState(code);
  const [qrOpen, setQrOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  // Phones and tablets show one side at a time (laptops show both side by side).
  const [view, setView] = useState<'session' | 'qa'>('session');

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
    <HostContext.Provider
      value={{
        getSocket,
        projectedTopicId: state.projectedTopicId,
        projectedAnswerId: state.projectedAnswerId,
      }}
    >
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
                <strong>Ended.</strong> Students now see that the lecture has ended. This session stays in
                your dashboard.
              </p>
              <DownloadResults sessionId={session.id} code={session.code} />
              <Button asChild variant="outline" size="sm">
                <Link to="/dashboard">
                  <Plus /> Start a new session
                </Link>
              </Button>
            </div>
          </div>
        )}

        <HostViewTabs
          view={view}
          onChange={(v) => {
            setView(v);
            window.scrollTo({ top: 0 });
          }}
          sessionLabel={ended ? 'Take-away' : 'Session'}
          openQuestions={state.questions.filter((q) => !q.addressed).length}
        />

        <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_400px] lg:items-start lg:py-8">
          <div className={cn('flex min-w-0 flex-col gap-6', view !== 'session' && 'max-lg:hidden')}>
            <h1 className="text-2xl font-semibold sm:text-3xl" dir="auto">
              <span className="font-normal text-muted-foreground">Topic: </span>
              {session.topic}
            </h1>

            {ended && <TakeawayEditor code={session.code} endedAt={session.endedAt} />}

            {!ended && (
              <InviteCard
                code={session.code}
                joinedCount={session.joinedCount}
                onShowQr={() => setQrOpen(true)}
              />
            )}

            <ActivitiesSection state={state} liveStats={liveStats} getSocket={getSocket} />

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
                {session.joinedCount} {session.joinedCount === 1 ? 'student' : 'students'} joined this
                session.
              </p>
            )}
          </div>

          <div className={cn('min-w-0', view !== 'qa' && 'max-lg:hidden')}>
            <QaPanel state={state} onShowQr={() => setQrOpen(true)} />
          </div>
        </main>

        <QrDialog code={session.code} open={qrOpen} onOpenChange={setQrOpen} />
        <EndSessionDialog open={endOpen} onOpenChange={setEndOpen} onConfirm={() => void endSession()} />
      </div>
    </HostContext.Provider>
  );
}

/** Phone/tablet switch between the session (activities) and Q&A; hidden on laptops. */
function HostViewTabs({
  view,
  onChange,
  sessionLabel,
  openQuestions,
}: {
  view: 'session' | 'qa';
  onChange: (v: 'session' | 'qa') => void;
  sessionLabel: string;
  openQuestions: number;
}) {
  const tabs = [
    { id: 'session' as const, label: sessionLabel, Icon: LayoutList, count: 0 },
    { id: 'qa' as const, label: 'Q&A', Icon: MessagesSquare, count: openQuestions },
  ];
  return (
    <div className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur lg:hidden">
      <div
        role="tablist"
        aria-label="Session view"
        className="mx-auto grid max-w-6xl grid-cols-2 gap-1 px-4 py-2 sm:px-6"
      >
        {tabs.map(({ id, label, Icon, count }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => onChange(id)}
            className={cn(
              'flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors',
              'focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
              view === id
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted',
            )}
            data-testid={`host-view-${id}`}
          >
            <Icon className="size-4" aria-hidden />
            {label}
            {count > 0 && (
              <span
                className={cn(
                  'min-w-5 rounded-full px-1.5 text-xs leading-5',
                  view === id ? 'bg-primary-foreground/20' : 'bg-attention/20 text-attention-foreground',
                )}
              >
                {count}
                <span className="sr-only"> open questions</span>
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Shot 09 / MVP: "Download results" → PDF report (to read, print or share) or Excel workbook (all the data). */
function DownloadResults({ sessionId, code }: { sessionId: string; code: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm">
          <Download /> Download results <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem asChild>
          <a href={`/s/${code}/report?print=1`} target="_blank" rel="noopener" className="items-start">
            <FileText className="mt-0.5" />
            <span className="flex flex-col">
              <span className="font-medium">PDF report</span>
              <span className="text-xs text-muted-foreground">To read, print or share</span>
            </span>
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={`/api/sessions/${sessionId}/export.xlsx`} download className="items-start">
            <FileSpreadsheet className="mt-0.5" />
            <span className="flex flex-col">
              <span className="font-medium">Excel workbook</span>
              <span className="text-xs text-muted-foreground">All the data, to sort and filter</span>
            </span>
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

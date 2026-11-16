import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, EyeOff, QrCode as QrIcon, RotateCcw, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import {
  nextStep,
  normalizeJoinCode,
  previousStep,
  runnable,
  stageNumber,
  type RunStep,
} from '@getit/shared';
import { LoadingState } from '@/components/brand/brand';
import { ErrorState } from '@/components/layout/ErrorState';
import { ReconnectingBanner } from '@/components/layout/ReconnectingBanner';
import { Button } from '@/components/ui/button';
import { emitAck } from '@/lib/emit';
import { cn } from '@/lib/utils';
import { EndedScreen, TopicScreen, WrapScreen } from './screens/OtherScreens';
import { QuestionScreen } from './screens/QuestionScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { Welcome } from './screens/Welcome';
import { SettingsDialog } from './SettingsDialog';
import { TimerChip } from './TimerChip';
import { usePresentState } from './use-present-state';

const KEYS_HELP =
  '→, Space or your clicker: next. ←: undo the last step. B: blank screen. R: vote again. Esc: exit.';

/** Projector (spec D, shots 05–08): run activities in order with one key. */
export function PresentPage() {
  const code = normalizeJoinCode(useParams().code ?? '');
  const navigate = useNavigate();
  const { state, liveStats, clockOffset, status, getSocket } = usePresentState(code);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const run = useCallback(
    async (step: RunStep) => {
      if (busyRef.current || step.type === 'none') return;
      busyRef.current = true;
      setBusy(true);
      const s = getSocket();
      const timerSec = state?.settings.timerSec ?? 0;
      try {
        if (step.type === 'launch')
          await emitAck(s, 'activity:launch', { activityId: step.activityId, timerSec });
        else if (step.type === 'close')
          await emitAck(s, 'activity:close', { activityId: step.activityId, reveal: step.reveal });
        else if (step.type === 'reveal') await emitAck(s, 'activity:reveal', { activityId: step.activityId });
        else if (step.type === 'undo') await emitAck(s, 'activity:undo', { activityId: step.activityId });
        else if (step.type === 'project') await emitAck(s, 'present:project', { item: step.item });
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [getSocket, state?.settings.timerSec],
  );

  const exit = useCallback(() => {
    window.close(); // opened by the host page → close; otherwise go back to the host view
    setTimeout(() => navigate(`/s/${code}/host`), 50);
  }, [code, navigate]);

  const stage = state?.activities.find((a) => a.id === state.stageActivityId && a.status !== 'DRAFT') ?? null;
  const next = state ? nextStep(state, state.settings.autoReveal) : null;
  const back = state ? previousStep(state) : null;

  const blankToggle = useCallback(() => {
    if (!state) return;
    void run({
      type: 'project',
      item: state.projected?.kind === 'blank' ? null : { kind: 'blank' },
      label: 'Blank',
    });
  }, [state, run]);
  const voteAgain = useCallback(() => {
    if (stage?.status !== 'CLOSED') return;
    void emitAck(getSocket(), 'activity:newRound', {
      activityId: stage.id,
      timerSec: state?.settings.timerSec ?? 0,
    });
  }, [stage, getSocket, state?.settings.timerSec]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [role="dialog"]') || e.metaKey || e.ctrlKey || e.altKey)
        return;
      if (e.key === 'Escape') return exit();
      if (!state || state.session.status === 'ENDED') return;
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) {
        e.preventDefault();
        if (next) void run(next);
      } else if (['ArrowLeft', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        if (back) void run(back);
      } else if (e.key === 'b' || e.key === 'B') {
        blankToggle();
      } else if (e.key === 'r' || e.key === 'R') {
        voteAgain();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, next, back, run, exit, blankToggle, voteAgain]);

  if (status === 'refused') {
    return (
      <ErrorState
        title="Can't open the projector view"
        body="Log in as the session's instructor and try again."
      />
    );
  }
  if (!state) return <LoadingState text="Opening the projector view…" />;

  const { session, projected } = state;
  const list = runnable(state.activities);
  const number = stageNumber(state);
  const ended = session.status === 'ENDED';
  const blank = projected?.kind === 'blank';
  const live = stage && liveStats[stage.id]?.round === stage.round ? liveStats[stage.id] : undefined;
  const answered = live?.responses ?? stage?.stats[stage.stats.length - 1]?.count ?? 0;

  let screen: React.ReactNode;
  if (ended) screen = <EndedScreen />;
  else if (projected?.kind === 'topic') screen = <TopicScreen topic={projected.topic} />;
  else if (projected?.kind === 'wrap')
    screen = (
      <WrapScreen activities={list.filter((a) => a.status !== 'DRAFT').length} joined={session.joinedCount} />
    );
  else if (projected?.kind === 'welcome' || !stage) screen = <Welcome session={session} />;
  else if (stage.status === 'LIVE')
    screen = (
      <QuestionScreen
        activity={stage}
        number={number}
        answered={answered}
        joined={live?.joined ?? session.joinedCount}
      />
    );
  else screen = <ResultsScreen activity={stage} />;

  return (
    <div className={cn('flex min-h-dvh flex-col', blank ? 'bg-foreground dark:bg-black' : 'bg-background')}>
      <ReconnectingBanner status={status} />
      {!blank && (
        <header className="flex items-center gap-3 p-4">
          <ol className="flex flex-1 gap-1.5" aria-label="Progress">
            {list.map((a) => (
              <li
                key={a.id}
                className={cn(
                  'h-1.5 w-10 rounded-full bg-muted',
                  a.status === 'REVEALED' || a.status === 'CLOSED'
                    ? 'bg-primary'
                    : a.id === stage?.id
                      ? 'bg-primary/50'
                      : '',
                )}
                aria-label={`${a.status === 'DRAFT' ? 'Not run' : a.status.toLowerCase()}`}
              />
            ))}
          </ol>
          {stage?.status === 'LIVE' && stage.closesAt && (
            <TimerChip
              closesAt={stage.closesAt}
              clockOffset={clockOffset}
              onAdd={() => void emitAck(getSocket(), 'activity:addTime', { activityId: stage.id })}
            />
          )}
          <button
            type="button"
            onClick={() =>
              void run({
                type: 'project',
                item: projected?.kind === 'welcome' ? null : { kind: 'welcome' },
                label: 'Join',
              })
            }
            className="flex h-11 items-center gap-2 rounded-lg border border-primary/25 bg-accent px-3 font-bold tracking-[0.2em] text-primary"
            aria-label={`Join: ${session.code}. Show the join screen`}
            title="Show the join screen (QR)"
            data-testid="present-join"
          >
            <QrIcon className="size-4" aria-hidden /> {session.code}
          </button>
          <SettingsDialog
            settings={state.settings}
            onChange={(s) => void emitAck(getSocket(), 'present:settings', s)}
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={blankToggle}
            aria-label="Blank screen (B)"
            title="Blank screen (B)"
          >
            <EyeOff className="size-5" />
          </Button>
          <Button variant="outline" size="icon" onClick={exit} aria-label="Exit projector view (Esc)">
            <X className="size-5" />
          </Button>
        </header>
      )}

      <main className="flex flex-1 items-center justify-center px-8 pb-8" data-testid="present-screen">
        {blank ? <p className="sr-only">Blank screen. Press B to show it again.</p> : screen}
      </main>

      {!blank && !ended && (
        <footer className="flex items-center gap-3 border-t px-6 py-3">
          <p className="flex-1 text-sm text-muted-foreground">{KEYS_HELP}</p>
          {stage?.status === 'CLOSED' && projected === null && (
            <Button variant="outline" size="lg" onClick={voteAgain} disabled={busy}>
              <RotateCcw /> Start round {stage.round + 1}
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            className="size-12"
            onClick={() => back && void run(back)}
            disabled={busy || back?.type === 'none'}
            aria-label="Undo the last step (←)"
          >
            <ChevronLeft className="size-5" />
          </Button>
          <Button
            size="lg"
            className="h-12 min-w-56 text-base"
            onClick={() => next && void run(next)}
            disabled={busy || next?.type === 'none'}
            data-testid="present-next"
          >
            {next?.label} <ChevronRight />
          </Button>
        </footer>
      )}
    </div>
  );
}

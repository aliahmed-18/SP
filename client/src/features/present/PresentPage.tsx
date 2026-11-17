import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Maximize,
  Minimize,
  QrCode as QrIcon,
  RotateCcw,
  X,
} from 'lucide-react';
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
import {
  AnswersCollected,
  EndedScreen,
  MisconceptionScreen,
  TopicScreen,
  WrapScreen,
} from './screens/OtherScreens';
import { QuestionScreen } from './screens/QuestionScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { Welcome } from './screens/Welcome';
import { SettingsDialog } from './SettingsDialog';
import { TimerChip } from './TimerChip';
import { usePresentState } from './use-present-state';

const KEYS_HELP =
  '→, Space or your clicker: next · ←: undo · B: hide the screen · F: full screen · R: vote again · Esc: exit';

/** Projector (spec D, shots 05–08): run activities in order with one key. */
export function PresentPage() {
  const code = normalizeJoinCode(useParams().code ?? '');
  const navigate = useNavigate();
  const { state, liveStats, clockOffset, status, getSocket } = usePresentState(code);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const { on: isFullscreen, toggle: toggleFullscreen, justExited } = useFullscreen();

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
    if (stage?.status !== 'CLOSED' || stage.type !== 'QUICK_CHECK') return;
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
      if (e.key === 'f' || e.key === 'F') return toggleFullscreen();
      // While the screen is hidden, the usual "next" keys (and Esc) bring it back instead of moving on
      // unseen — so a clicker or a stray key can never leave the instructor stuck on a blank screen.
      if (state?.projected?.kind === 'blank') {
        if (
          ['ArrowRight', 'ArrowLeft', 'PageDown', 'PageUp', ' ', 'Enter', 'Escape', 'b', 'B'].includes(e.key)
        ) {
          e.preventDefault();
          blankToggle();
        }
        return;
      }
      // Esc that just left full screen must not also close the projector window.
      if (e.key === 'Escape') return justExited() ? undefined : exit();
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
  }, [state, next, back, run, exit, blankToggle, voteAgain, toggleFullscreen, justExited]);

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
  const answered =
    live?.responses ??
    (stage?.type === 'EXPLAIN' ? stage.responseCount : stage?.stats[stage.stats.length - 1]?.count) ??
    0;

  let screen: React.ReactNode;
  if (ended) screen = <EndedScreen />;
  else if (projected?.kind === 'topic') screen = <TopicScreen topic={projected.topic} />;
  else if (projected?.kind === 'misconception')
    screen = <MisconceptionScreen prompt={projected.prompt} text={projected.text} />;
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
  else if (stage.type === 'EXPLAIN') screen = <AnswersCollected prompt={stage.prompt} count={answered} />;
  else screen = <ResultsScreen activity={stage} />;

  return (
    <div className={cn('flex h-dvh flex-col', blank ? 'bg-foreground dark:bg-black' : 'bg-background')}>
      <ReconnectingBanner status={status} />
      {!blank && (
        <header className="flex shrink-0 items-center gap-3 p-4 short:py-2">
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
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit full screen (F)' : 'Full screen (F)'}
            title={isFullscreen ? 'Exit full screen (F)' : 'Full screen (F)'}
          >
            {isFullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={blankToggle}
            aria-label="Hide the screen (B)"
            title="Hide the screen (B)"
            data-testid="present-hide"
          >
            <EyeOff className="size-5" />
          </Button>
          <Button variant="outline" size="icon" onClick={exit} aria-label="Exit projector view (Esc)">
            <X className="size-5" />
          </Button>
        </header>
      )}

      {blank ? (
        <BlankScreen onShow={blankToggle} />
      ) : (
        // Header and controls always stay on screen; only the slide itself scrolls if it ever gets too tall.
        <main
          className="flex min-h-0 flex-1 overflow-y-auto px-8 pb-8 short:pb-4"
          data-testid="present-screen"
        >
          <div className="m-auto flex w-full justify-center">{screen}</div>
        </main>
      )}

      {!blank && !ended && (
        <footer className="flex shrink-0 items-center gap-3 border-t px-6 py-3 short:py-2">
          <p className="flex-1 text-sm text-muted-foreground">{KEYS_HELP}</p>
          {stage?.status === 'CLOSED' && stage.type === 'QUICK_CHECK' && projected === null && (
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

/**
 * The hidden screen: dark for the class, but never a trap for the instructor. Click anywhere, or press
 * B / → / Space / Esc, to show it again; a small "Show screen" button appears whenever the mouse moves.
 */
function BlankScreen({ onShow }: { onShow: () => void }) {
  const [hint, setHint] = useState(true);
  useEffect(() => {
    let t = setTimeout(() => setHint(false), 4000);
    const wake = () => {
      setHint(true);
      clearTimeout(t);
      t = setTimeout(() => setHint(false), 2500);
    };
    window.addEventListener('mousemove', wake);
    return () => {
      clearTimeout(t);
      window.removeEventListener('mousemove', wake);
    };
  }, []);
  return (
    <main
      className={cn('relative flex flex-1 cursor-pointer', !hint && 'cursor-none')}
      onClick={onShow}
      data-testid="present-blank"
    >
      <p className="sr-only">The screen is hidden. Press B or click to show it again.</p>
      <Button
        variant="secondary"
        size="lg"
        onClick={(e) => {
          e.stopPropagation();
          onShow();
        }}
        className={cn(
          'absolute right-6 bottom-6 opacity-80 transition-opacity duration-300 focus-visible:opacity-100',
          !hint && 'pointer-events-none opacity-0',
        )}
      >
        <Eye /> Show screen <span className="text-muted-foreground">(B)</span>
      </Button>
    </main>
  );
}

/** Browser full screen for the projector window (F key or the header button). */
function useFullscreen() {
  const [on, setOn] = useState(() => !!document.fullscreenElement);
  const exitedAt = useRef(0);
  useEffect(() => {
    const sync = () => {
      if (!document.fullscreenElement) exitedAt.current = Date.now();
      setOn(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);
  const justExited = useCallback(
    () => !!document.fullscreenElement || Date.now() - exitedAt.current < 500,
    [],
  );
  return { on, toggle, justExited };
}

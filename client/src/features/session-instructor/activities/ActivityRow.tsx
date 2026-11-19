import { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  CircleCheck,
  Eye,
  Lock,
  Pencil,
  Play,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { answerLabel, type ActivityStats, type HostActivity } from '@getit/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { GetitSocket } from '@/lib/socket';
import { cn } from '@/lib/utils';
import { aiApi } from '../ai/ai-api';
import { ConfirmDialog } from '../qa/ConfirmDialog';
import { ApiRequestError } from '@/lib/api';
import { activitiesApi, runLifecycle } from './activities-api';
import { activityKind } from './kinds';
import { ExplainAnswers } from './ExplainAnswers';
import { ResultsPanel } from './ResultsPanel';

async function confirmDraft(id: string) {
  try {
    await aiApi.confirm(id);
    toast.success('Draft confirmed');
    return true;
  } catch (err) {
    toast.error(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    return false;
  }
}

const STATUS_BADGE = {
  DRAFT: null,
  LIVE: { label: 'Live', variant: 'attention' as const },
  CLOSED: { label: 'Closed', variant: 'secondary' as const },
  REVEALED: { label: 'Done', variant: 'accent' as const },
};

export function ActivityRow({
  activity,
  index,
  count,
  joined,
  live,
  anotherLive,
  ended,
  canRun,
  getSocket,
  onEdit,
  onMove,
}: {
  activity: HostActivity;
  index: number;
  count: number;
  joined: number;
  live: ActivityStats | undefined;
  anotherLive: boolean;
  ended: boolean;
  /** The session is LIVE: activities can be launched (a planned lecture is prepared, not run). */
  canRun: boolean;
  getSocket: () => GetitSocket | null;
  onEdit: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const a = activity;
  // null = automatic: drafts stay compact, anything that has run shows its live count / results.
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const open = expanded ?? a.status !== 'DRAFT';
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const kind = a.kind ?? 'MCQ';
  const { label: kindLabel, Icon } = activityKind(a);
  const isExplain = a.type === 'EXPLAIN';
  const badge = STATUS_BADGE[a.status];
  const run = async (fn: () => Promise<boolean>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };
  const life = (event: 'activity:launch' | 'activity:reveal' | 'activity:newRound', activityId = a.id) =>
    run(() => runLifecycle(getSocket(), event, { activityId }));
  const close = (reveal: boolean) =>
    run(() => runLifecycle(getSocket(), 'activity:close', { activityId: a.id, reveal }));

  const currentRoundCount =
    live && live.round === a.round
      ? live.responses
      : isExplain
        ? a.responseCount
        : (a.stats[a.stats.length - 1]?.count ?? 0);
  const joinedNow = live?.joined ?? joined;

  return (
    <li
      className={cn(
        'rounded-2xl border bg-card',
        a.status === 'LIVE' && 'border-attention/60 ring-1 ring-attention/40',
      )}
      data-testid="activity-row"
    >
      <div className="flex items-center gap-2 p-2 pl-3">
        <span className="w-5 text-center text-sm text-muted-foreground">{index + 1}</span>
        <Badge variant="accent" className="hidden sm:inline-flex">
          <Icon aria-hidden /> {kindLabel}
        </Badge>
        <button
          type="button"
          onClick={() => setExpanded(!open)}
          aria-expanded={open}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-1 text-left"
        >
          <span className="min-w-0 flex-1 font-medium break-words" dir="auto">
            {a.prompt}
          </span>
          {a.aiDraft && (
            <Badge variant="attention" data-testid="ai-draft-badge">
              <Sparkles aria-hidden /> AI draft
            </Badge>
          )}
          {badge && (
            <Badge variant={badge.variant}>
              {a.status === 'LIVE' && <span className="size-1.5 rounded-full bg-attention" aria-hidden />}
              {badge.label}
              {a.round > 1 && ` · round ${a.round}`}
            </Badge>
          )}
          <ChevronDown
            className={cn('size-5 shrink-0 transition-transform', open && 'rotate-180')}
            aria-hidden
          />
        </button>
        {a.aiDraft && !ended && !open && (
          <Button size="sm" variant="outline" onClick={() => setExpanded(true)}>
            <Eye /> Review
          </Button>
        )}
        {a.status === 'DRAFT' && !a.aiDraft && canRun && !open && (
          <Button
            size="sm"
            onClick={() => void life('activity:launch')}
            disabled={busy || anotherLive}
            title={anotherLive ? 'One activity can be live at a time.' : undefined}
          >
            <Play /> Launch
          </Button>
        )}
      </div>

      {open && (
        <div className="flex flex-col gap-4 border-t p-4">
          {a.aiDraft && (
            <p className="rounded-lg bg-attention/10 p-3 text-sm" data-testid="ai-draft-help">
              AI draft: check the question, the correct answer and the explanation, then confirm it — or edit
              it, which confirms it too. It can't be launched before that.
            </p>
          )}
          {a.status === 'DRAFT' && isExplain && (
            <p className="text-sm text-muted-foreground">
              {a.modelAnswer ? `Model answer (only you see it): ${a.modelAnswer}` : 'No model answer.'}
            </p>
          )}
          {a.status === 'DRAFT' && !isExplain && (
            <ul className="flex flex-col gap-1 text-sm">
              {kind === 'NUMERIC' ? (
                <li>
                  Correct answer: <strong>{String(a.correct)}</strong> ± {a.tolerance ?? 0}
                </li>
              ) : (
                (kind === 'MCQ' ? a.options.map((_, i) => i) : [true, false]).map((v) => (
                  <li
                    key={String(v)}
                    className={cn('flex gap-2', v === a.correct && 'font-semibold text-correct')}
                    dir="auto"
                  >
                    {v === a.correct ? '✓' : '·'} {answerLabel(a.kind, a.options, v)}
                  </li>
                ))
              )}
              <li className="mt-1 text-muted-foreground">Explanation: {a.explanation}</li>
            </ul>
          )}

          {a.status === 'LIVE' && (
            <div aria-live="polite">
              <p className="text-sm">
                <strong className="text-2xl" data-testid="answered-count">
                  {currentRoundCount}
                </strong>{' '}
                / {joinedNow} answered
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300"
                  style={{ width: `${Math.min(100, (100 * currentRoundCount) / Math.max(1, joinedNow))}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {isExplain
                  ? 'You see the answers when you close it.'
                  : 'Results stay hidden until you close the question.'}
              </p>
            </div>
          )}

          {(a.status === 'CLOSED' || a.status === 'REVEALED') &&
            (isExplain ? (
              <ExplainAnswers activity={a} />
            ) : (
              <ResultsPanel activity={a} showAnswer={a.status === 'REVEALED'} />
            ))}

          <div className="flex flex-wrap items-center gap-2">
            {a.aiDraft && !ended && (
              <Button onClick={() => void run(() => confirmDraft(a.id))}>
                <CircleCheck /> Confirm draft
              </Button>
            )}
            {a.status === 'DRAFT' && !a.aiDraft && canRun && (
              <Button
                onClick={() => void life('activity:launch')}
                disabled={busy || anotherLive}
                title={anotherLive ? 'One activity can be live at a time.' : undefined}
              >
                <Play /> Launch
              </Button>
            )}
            {a.status === 'LIVE' && isExplain && (
              <Button onClick={() => void close(false)} disabled={busy}>
                <Lock /> Close answers
              </Button>
            )}
            {a.status === 'LIVE' && !isExplain && (
              <>
                <Button onClick={() => void close(true)} disabled={busy}>
                  <Eye /> Close and show answer
                </Button>
                <Button variant="outline" onClick={() => void close(false)} disabled={busy}>
                  <Lock /> Close
                </Button>
              </>
            )}
            {a.status === 'CLOSED' && !isExplain && (
              <>
                <Button onClick={() => void life('activity:reveal')} disabled={busy}>
                  <Eye /> Show answer
                </Button>
                {!ended && (
                  <Button
                    variant="outline"
                    onClick={() => void life('activity:newRound')}
                    disabled={busy || anotherLive}
                  >
                    <RotateCcw /> Start round {a.round + 1}
                  </Button>
                )}
              </>
            )}
            {a.status !== 'LIVE' && (
              <Button variant="ghost" size="sm" onClick={onEdit}>
                <Pencil /> Edit
              </Button>
            )}
            <span className="ml-auto flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Move up"
                disabled={index === 0}
                onClick={() => onMove(-1)}
              >
                <ArrowUp className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Move down"
                disabled={index === count - 1}
                onClick={() => onMove(1)}
              >
                <ArrowDown className="size-4" />
              </Button>
              {a.status !== 'LIVE' && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Delete activity"
                  onClick={() => setDeleting(true)}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </span>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this activity?"
        body={
          a.status === 'DRAFT'
            ? "It hasn't been run yet."
            : 'Its results are deleted too. This cannot be undone.'
        }
        confirm="Delete"
        destructive
        onConfirm={() => void activitiesApi.remove(a.id)}
      />
    </li>
  );
}

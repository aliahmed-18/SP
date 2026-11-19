import { useState } from 'react';
import { Copy, ListChecks, MessageSquareText, Sparkles } from 'lucide-react';
import type { ActivityStats, HostActivity, HostState, QuickCheckKind } from '@getit/shared';
import { Button } from '@/components/ui/button';
import type { GetitSocket } from '@/lib/socket';
import { AiActivityBar } from '../ai/AiActivityBar';
import { AiGradeAll } from '../ai/AiGradeAll';
import { AiGenerateDialog } from '../ai/AiGenerateDialog';
import { useAiEnabled } from '../ai/ai-api';
import { activitiesApi } from './activities-api';
import { ActivityEditorDialog, type EditorTarget } from './ActivityEditorDialog';
import { ActivityRow } from './ActivityRow';
import { CopyActivitiesDialog } from './CopyActivitiesDialog';
import { ExplainEditorDialog } from './ExplainEditorDialog';
import { KIND_ICON, KIND_LABEL } from './kinds';

const KINDS: QuickCheckKind[] = ['MCQ', 'TRUE_FALSE', 'NUMERIC'];

/** Shot 02/03 left column: "Set up activities" tiles + "Activities list" in run order. */
export function ActivitiesSection({
  state,
  liveStats,
  getSocket,
}: {
  state: HostState;
  liveStats: Record<string, ActivityStats>;
  getSocket: () => GetitSocket | null;
}) {
  const { session, activities, liveActivityId } = state;
  const ended = session.status === 'ENDED';
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const aiEnabled = useAiEnabled();
  const [explainEditor, setExplainEditor] = useState<{ activity?: HostActivity } | null>(null);

  const move = (index: number, dir: -1 | 1) => {
    const ids = activities.map((a) => a.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j]!, ids[index]!];
    void activitiesApi.reorder(session.code, ids);
  };

  return (
    <>
      {!ended && (
        <section aria-labelledby="setup-title" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="setup-title" className="text-xl font-semibold">
              Set up activities
            </h2>
            <div className="flex flex-wrap gap-2">
              {aiEnabled && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAiOpen(true)}
                  className="border-primary/40"
                >
                  <Sparkles className="text-attention" /> AI generation
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setCopyOpen(true)}>
                <Copy /> Copy from an earlier session
              </Button>
            </div>
          </div>
          <p className="text-sm font-medium text-primary">Assess</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {KINDS.map((k) => {
              const Icon = KIND_ICON[k];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setEditor({ kind: k })}
                  className="flex min-h-28 flex-col items-center justify-center gap-3 rounded-2xl border bg-card p-3 text-center font-medium transition-colors hover:bg-accent/60"
                >
                  <span className="grid size-10 place-items-center rounded-lg bg-accent text-primary">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  {KIND_LABEL[k]}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setExplainEditor({})}
              className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border bg-card p-3 text-center font-medium transition-colors hover:bg-accent/60"
            >
              <span className="grid size-10 place-items-center rounded-lg bg-accent text-primary">
                <MessageSquareText className="size-5" aria-hidden />
              </span>
              Explain
              <span className="-mt-1 text-xs font-normal text-muted-foreground">Short written answer</span>
            </button>
          </div>
        </section>
      )}

      <section aria-labelledby="activities-title" className="flex flex-col gap-3">
        <h2 id="activities-title" className="text-xl font-semibold">
          Activities list{' '}
          {activities.length > 0 && (
            <span className="text-base font-normal text-muted-foreground">{activities.length}</span>
          )}
        </h2>
        {aiEnabled && <AiGradeAll code={session.code} job={state.aiGrade} activities={activities} />}
        {!ended && (
          <AiActivityBar
            code={session.code}
            job={state.aiJob}
            drafts={activities.filter((x) => x.aiDraft).length}
          />
        )}
        {activities.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed p-10 text-center">
            <ListChecks className="size-6 text-primary" aria-hidden />
            <p className="font-medium">No activity added yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {ended
                ? 'No activities were run in this session.'
                : 'Pick a type above, or copy activities from an earlier session.'}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {activities.map((a, i) => (
              <ActivityRow
                key={a.id}
                activity={a}
                index={i}
                count={activities.length}
                joined={session.joinedCount}
                live={liveStats[a.id]}
                anotherLive={liveActivityId !== null && liveActivityId !== a.id}
                ended={ended}
                canRun={session.status === 'LIVE'}
                getSocket={getSocket}
                onEdit={() =>
                  a.type === 'EXPLAIN'
                    ? setExplainEditor({ activity: a })
                    : setEditor({ kind: a.kind ?? 'MCQ', activity: a })
                }
                onMove={(dir) => move(i, dir)}
              />
            ))}
          </ul>
        )}
      </section>

      <ActivityEditorDialog code={session.code} target={editor} onClose={() => setEditor(null)} />
      <ExplainEditorDialog
        code={session.code}
        target={explainEditor}
        onClose={() => setExplainEditor(null)}
      />
      {aiEnabled && (
        <AiGenerateDialog
          code={session.code}
          open={aiOpen}
          onOpenChange={setAiOpen}
          busy={state.aiJob?.status === 'running'}
        />
      )}
      <CopyActivitiesDialog
        code={session.code}
        sessionId={session.id}
        open={copyOpen}
        onOpenChange={setCopyOpen}
      />
    </>
  );
}

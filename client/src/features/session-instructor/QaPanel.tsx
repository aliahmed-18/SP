import { useState } from 'react';
import { Flag, Layers, List, Sparkles } from 'lucide-react';
import { AI_LIMITS, type HostState } from '@getit/shared';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AiGroupDialog } from './ai/AiGroupDialog';
import { useAiEnabled } from './ai/ai-api';
import { QuestionsTab } from './qa/QuestionsTab';
import { TopicsTab } from './qa/TopicsTab';

/** Right side panel (shots 02/03): Q&A with Topics and List tabs. */
export function QaPanel({ state, onShowQr }: { state: HostState; onShowQr: () => void }) {
  const { questions, topics, session } = state;
  const n = questions.length;
  const aiEnabled = useAiEnabled();
  const [aiOpen, setAiOpen] = useState(false);
  const ungrouped = questions.filter((q) => !q.topicId && q.partId === state.parts.at(-1)?.id).length;
  return (
    <aside aria-labelledby="qa-title" className="min-w-0 rounded-2xl border bg-card">
      <Tabs defaultValue={topics.length ? 'topics' : 'list'}>
        <div className="flex flex-col gap-3 border-b p-4 sm:p-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 id="qa-title" className="text-lg font-semibold">
                Q&amp;A
              </h2>
              <p className="text-sm text-muted-foreground" aria-live="polite" data-testid="question-count">
                {n} {n === 1 ? 'question' : 'questions'}
              </p>
            </div>
            <span
              className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-sm"
              title="Flagged: blocked by moderation or removed by you"
              data-testid="flagged-count"
            >
              <Flag className="size-4" aria-hidden /> {session.flaggedCount}
              <span className="sr-only">flagged</span>
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TabsList>
              <TabsTrigger value="topics">
                <Layers /> Topics <span className="text-xs text-muted-foreground">{topics.length}</span>
              </TabsTrigger>
              <TabsTrigger value="list">
                <List /> List <span className="text-xs text-muted-foreground">{n}</span>
              </TabsTrigger>
            </TabsList>
            {aiEnabled && session.status === 'LIVE' && (
              <Button
                size="sm"
                onClick={() => setAiOpen(true)}
                disabled={ungrouped < AI_LIMITS.groupQuestionsMin}
                title={
                  ungrouped < AI_LIMITS.groupQuestionsMin
                    ? `Needs at least ${AI_LIMITS.groupQuestionsMin} questions that aren't in a topic`
                    : undefined
                }
              >
                <Sparkles className="text-attention" /> Group with AI
              </Button>
            )}
          </div>
        </div>
        <div className="p-2 sm:p-4">
          <TabsContent value="topics">
            <TopicsTab state={state} />
          </TabsContent>
          <TabsContent value="list">
            <QuestionsTab state={state} onShowQr={onShowQr} />
          </TabsContent>
        </div>
      </Tabs>
      {aiEnabled && aiOpen && <AiGroupDialog state={state} open onOpenChange={setAiOpen} />}
    </aside>
  );
}

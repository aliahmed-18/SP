import { Flag, Layers, List } from 'lucide-react';
import type { HostState } from '@getit/shared';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { QuestionsTab } from './qa/QuestionsTab';
import { TopicsTab } from './qa/TopicsTab';

/** Right side panel (shots 02/03): Q&A with Topics and List tabs. */
export function QaPanel({ state, onShowQr }: { state: HostState; onShowQr: () => void }) {
  const { questions, topics, session } = state;
  const n = questions.length;
  return (
    <aside aria-labelledby="qa-title" className="min-w-0 rounded-2xl border bg-card">
      <Tabs defaultValue={topics.length ? 'topics' : 'list'}>
        <div className="flex flex-col gap-3 border-b p-5">
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
          <TabsList>
            <TabsTrigger value="topics">
              <Layers /> Topics <span className="text-xs text-muted-foreground">{topics.length}</span>
            </TabsTrigger>
            <TabsTrigger value="list">
              <List /> List <span className="text-xs text-muted-foreground">{n}</span>
            </TabsTrigger>
          </TabsList>
        </div>
        <div className="p-4">
          <TabsContent value="topics">
            <TopicsTab state={state} />
          </TabsContent>
          <TabsContent value="list">
            <QuestionsTab state={state} onShowQr={onShowQr} />
          </TabsContent>
        </div>
      </Tabs>
    </aside>
  );
}

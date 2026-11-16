import { useState } from 'react';
import { Check, CircleStop } from 'lucide-react';
import { useParams } from 'react-router';
import { normalizeJoinCode } from '@getit/shared';
import { LoadingState } from '@/components/brand/brand';
import { ReconnectingBanner } from '@/components/layout/ReconnectingBanner';
import { dismiss, getMyQuestions, isDismissed, type MyQuestion } from '@/lib/local-history';
import { ActivityView } from './activity/ActivityView';
import { AskSheet } from './AskSheet';
import { AskBox } from './AskBox';
import { InvalidSession } from './InvalidSession';
import { MyQuestions } from './MyQuestions';
import { StudentHeader } from './StudentHeader';
import { TopicsList } from './TopicsList';
import { useStudentState } from './use-student-state';

/** `/s/:code` — the phone screen (shots 20–29). */
export function StudentPage() {
  const code = normalizeJoinCode(useParams().code ?? '');
  const { state, status, getSocket, applyMeToo, applyMyResponse } = useStudentState(code);

  if (status === 'refused') return <InvalidSession code={code} />;
  if (!state) return <LoadingState text="Joining the lecture…" />;
  // Keyed by session id so the local list/draft reload when the code points at a new lecture.
  return (
    <StudentView
      key={state.session.id}
      state={state}
      status={status}
      getSocket={getSocket}
      applyMeToo={applyMeToo}
      applyMyResponse={applyMyResponse}
    />
  );
}

function StudentView({
  state,
  status,
  getSocket,
  applyMeToo,
  applyMyResponse,
}: Pick<ReturnType<typeof useStudentState>, 'getSocket' | 'applyMeToo' | 'applyMyResponse' | 'status'> & {
  state: NonNullable<ReturnType<typeof useStudentState>['state']>;
}) {
  const sessionId = state.session.id;
  const [mine, setMine] = useState<MyQuestion[]>(() => getMyQuestions(sessionId));
  const ended = state.session.status === 'ENDED';
  const [, rerender] = useState(0);
  const activity = state.liveActivity;
  const activityKey = activity ? `${activity.id}:${activity.round}:${activity.status}` : null;
  // The phone switches to the activity on stage (spec E); "Back to the lecture" closes a finished one.
  const showActivity = !ended && activity && !(activity.status !== 'LIVE' && isDismissed(activityKey!));

  return (
    <div className="min-h-dvh pb-10">
      <ReconnectingBanner status={status} />
      <StudentHeader topic={state.session.topic} />
      <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-6">
        {showActivity ? (
          <>
            <ActivityView
              key={activityKey}
              sessionId={sessionId}
              activity={activity}
              mine={state.myResponse}
              getSocket={getSocket}
              onMine={applyMyResponse}
              onBack={() => {
                dismiss(activityKey!);
                rerender((n) => n + 1);
                window.scrollTo({ top: 0 });
              }}
            />
            <AskSheet
              sessionId={sessionId}
              getSocket={getSocket}
              online={status === 'connected'}
              sentCount={mine.length}
              onSent={setMine}
            />
          </>
        ) : ended ? (
          <section
            className="fade-in flex flex-col items-center gap-3 rounded-2xl border bg-card p-8 text-center"
            aria-live="polite"
          >
            <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
              <CircleStop className="size-6" aria-hidden />
            </span>
            <h1 className="text-2xl font-semibold">The lecture has ended</h1>
            <p className="text-muted-foreground">
              {state.takeawayPublished
                ? 'Your Take-away is ready.'
                : 'The instructor is preparing your Take-away. Keep this page open or come back later.'}
            </p>
          </section>
        ) : (
          <>
            <section className="fade-in flex items-start gap-4" aria-live="polite">
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-accent text-primary">
                <Check className="size-6" aria-hidden />
              </span>
              <div>
                <h1 className="text-2xl font-semibold">You're in</h1>
                <p className="text-muted-foreground">
                  Ask anything, any time. The instructor never sees who asked.
                </p>
              </div>
            </section>
            <AskBox
              sessionId={sessionId}
              getSocket={getSocket}
              online={status === 'connected'}
              sentCount={mine.length}
              onSent={setMine}
            />
          </>
        )}
        {!showActivity && (
          <>
            <MyQuestions questions={mine} />
            <TopicsList
              topics={state.topics}
              getSocket={getSocket}
              canMeToo={!ended}
              applyMeToo={applyMeToo}
            />
          </>
        )}
      </main>
    </div>
  );
}

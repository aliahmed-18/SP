import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, Printer } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router';
import {
  answerLabel,
  normalizeJoinCode,
  type ExplainTag,
  type HostActivity,
  type HostState,
  type TakeawayDraft,
  type TopicStatus,
} from '@getit/shared';
import { LoadingState, Wordmark } from '@/components/brand/brand';
import { ErrorState } from '@/components/layout/ErrorState';
import { Button } from '@/components/ui/button';
import { activityKind } from '@/features/session-instructor/activities/kinds';
import { api } from '@/lib/api';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const TOPIC_STATUS: Record<TopicStatus, string> = {
  OPEN: 'Open',
  ANSWERED_IN_CLASS: 'Answered in class',
  REPLIED: 'Replied in writing',
};
const TAG: Record<ExplainTag, { label: string; className: string }> = {
  CORRECT: { label: 'Correct', className: 'bg-correct/15 text-correct' },
  PARTIAL: { label: 'Partial', className: 'bg-accent text-accent-foreground' },
  MISCONCEPTION: { label: 'Misconception', className: 'bg-attention/20 text-attention-foreground' },
};
const dateFmt = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const pct = (n: number) => `${Math.round(n)}%`;

/** "getit-report-linear-regression-2026-11-17": the browser uses the page title as the PDF file name. */
function reportName(topic: string, startedAt: string) {
  const slug = topic
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 40);
  return `getit-report-${slug || 'session'}-${startedAt.slice(0, 10)}`;
}

function duration(from: string, to: string | null) {
  if (!to) return null;
  const min = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 60_000));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}

/**
 * PDF report (like the MVP's "Download results → PDF report"): a print-ready page the instructor saves
 * as PDF with the browser's print dialog. The browser draws the text, so Arabic questions stay correct.
 * Anonymous like everything else: no names, devices or identities — only what the host view shows.
 */
export function ReportPage() {
  const code = normalizeJoinCode(useParams().code ?? '');
  const [params] = useSearchParams();
  const host = useQuery({
    queryKey: ['report', code],
    queryFn: () => api<HostState>(`/sessions/${code}/host`),
    retry: false,
  });
  const ended = host.data?.session.status === 'ENDED';
  const takeaway = useQuery({
    queryKey: ['report-takeaway', code],
    queryFn: () => api<TakeawayDraft>(`/sessions/${code}/takeaway/draft`),
    enabled: ended,
    retry: false,
  });
  const ready = !!host.data && (!ended || !takeaway.isPending);

  // Always print on white: switch the page to the light theme while the report is open.
  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains('dark');
    root.classList.remove('dark');
    return () => {
      if (wasDark) root.classList.add('dark');
    };
  }, []);

  useEffect(() => {
    if (!host.data) return;
    const before = document.title;
    document.title = reportName(host.data.session.topic, host.data.session.startedAt);
    return () => {
      document.title = before;
    };
  }, [host.data]);

  // Opened from "Download results → PDF report": open the print dialog once the fonts are in.
  const printed = useRef(false);
  useEffect(() => {
    if (!ready || printed.current || params.get('print') !== '1') return;
    printed.current = true;
    void document.fonts.ready.then(() => setTimeout(() => window.print(), 300));
  }, [ready, params]);

  if (host.isError)
    return (
      <ErrorState
        title="Can't open this report"
        body="Log in as the session's instructor and try again."
        action={
          <Button asChild>
            <Link to="/dashboard">Go to dashboard</Link>
          </Button>
        }
      />
    );
  if (!ready || !host.data) return <LoadingState text="Preparing the report…" />;

  const { session, questions, topics, activities, parts } = host.data;
  const ran = activities.filter((a) => a.status !== 'DRAFT');
  const checks = ran.filter((a) => a.type === 'QUICK_CHECK');
  const explains = ran.filter((a) => a.type === 'EXPLAIN');
  const keyPoints = takeaway.data?.keyPoints.filter(Boolean) ?? [];
  const sortedTopics = [...topics].sort((a, b) => b.meTooCount - a.meTooCount);
  const ungrouped = questions.filter((q) => !q.topicId).reverse(); // oldest first
  const partNumber = new Map(parts.map((p) => [p.id, p.number]));
  const length = duration(session.startedAt, session.endedAt);

  return (
    <div className="min-h-dvh bg-background print:bg-white">
      <div className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Button asChild variant="ghost" size="sm">
            <Link to={`/s/${code}/host`}>
              <ArrowLeft /> Back to the session
            </Link>
          </Button>
          <p className="hidden flex-1 text-sm text-muted-foreground sm:block">
            In the print window, choose <strong>Save as PDF</strong>.
          </p>
          <Button onClick={() => window.print()} className="ml-auto" data-testid="report-print">
            <Printer /> Save as PDF
          </Button>
        </div>
      </div>

      <article
        className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-8 sm:px-6 print:max-w-none print:p-0"
        data-testid="report"
      >
        <header className="flex flex-col gap-4 border-b pb-6">
          <div className="flex items-center justify-between gap-4">
            <Wordmark className="h-9 w-auto" />
            <p className="text-sm text-muted-foreground">Session report</p>
          </div>
          <div>
            <h1 className="text-3xl font-bold" dir="auto">
              {session.topic}
            </h1>
            <p className="mt-1 text-muted-foreground">
              {dateFmt.format(new Date(session.startedAt))} · {formatTime(session.startedAt)}
              {session.endedAt && ` – ${formatTime(session.endedAt)}`}
              {length && ` (${length})`} · Code {session.code}
              {session.status === 'LIVE' && ' · still live'}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="Students joined" value={session.joinedCount} />
            <Stat label="Questions" value={questions.length} />
            <Stat label="Topics" value={topics.length} />
            <Stat label="Activities run" value={ran.length} />
            <Stat label="Flagged" value={session.flaggedCount} />
          </dl>
        </header>

        {keyPoints.length > 0 && (
          <Section
            title="Take-away"
            note={takeaway.data?.status === 'PUBLISHED' ? 'Published to students' : 'Draft, not published'}
          >
            <ol className="flex list-decimal flex-col gap-2 pl-6">
              {keyPoints.map((k, i) => (
                <li key={i} dir="auto">
                  {k}
                </li>
              ))}
            </ol>
          </Section>
        )}

        <Section title="Quick Checks" note={`${checks.length} run`}>
          {checks.length === 0 ? (
            <Empty>No Quick Checks were run.</Empty>
          ) : (
            checks.map((a, i) => <QuickCheckReport key={a.id} activity={a} index={i + 1} />)
          )}
        </Section>

        {explains.length > 0 && (
          <Section title="Explain" note={`${explains.length} run`}>
            {explains.map((a, i) => (
              <ExplainReport key={a.id} activity={a} index={i + 1} />
            ))}
          </Section>
        )}

        <Section
          title="Questions from the class"
          note={`${questions.length} ${questions.length === 1 ? 'question' : 'questions'} · ${topics.length} ${topics.length === 1 ? 'topic' : 'topics'}`}
        >
          {questions.length === 0 && <Empty>No questions were asked.</Empty>}
          {sortedTopics.map((t) => {
            const qs = questions.filter((q) => q.topicId === t.id).reverse();
            return (
              <div key={t.id} className="rounded-xl border p-4 break-inside-avoid">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-lg font-semibold" dir="auto">
                    {t.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {qs.length} asked · {t.meTooCount} “Me too” · {TOPIC_STATUS[t.status]}
                  </p>
                </div>
                <ul className="mt-2 flex flex-col gap-1 text-sm">
                  {qs.map((q) => (
                    <li key={q.id} dir="auto">
                      • {q.text}
                    </li>
                  ))}
                </ul>
                {t.reply && (
                  <p
                    className="mt-3 rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground"
                    dir="auto"
                  >
                    <strong>Your reply:</strong> {t.reply}
                  </p>
                )}
              </div>
            );
          })}
          {ungrouped.length > 0 && (
            <div className="break-inside-avoid-page">
              <h3 className="mb-2 font-semibold">Not in a topic ({ungrouped.length})</h3>
              <ul className="flex flex-col divide-y rounded-xl border text-sm">
                {ungrouped.map((q) => (
                  <li key={q.id} className="flex items-start gap-3 px-3 py-2 break-inside-avoid">
                    <span className="w-24 shrink-0 text-muted-foreground tabular-nums">
                      {parts.length > 1 && `Part ${partNumber.get(q.partId) ?? 1} · `}
                      {formatTime(q.createdAt)}
                    </span>
                    <span className="flex-1" dir="auto">
                      {q.text}
                    </span>
                    {q.addressed && (
                      <span className="flex items-center gap-1 text-correct">
                        <Check className="size-4" aria-hidden /> Addressed
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>

        <footer className="border-t pt-4 text-xs text-muted-foreground">
          Made with Getit · {new Date().toLocaleString('en-GB')} · Anonymous: no student names or devices are
          recorded.
        </footer>
      </article>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-muted px-4 py-3 print:border print:bg-white">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-bold tabular-nums">{value}</dd>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3 border-b pb-2 break-after-avoid">
        <h2 className="text-xl font-semibold">{title}</h2>
        {note && <p className="text-sm text-muted-foreground">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function QuickCheckReport({ activity: a, index }: { activity: HostActivity; index: number }) {
  const { label, Icon } = activityKind(a);
  const correct =
    a.correct === null
      ? null
      : a.kind === 'NUMERIC'
        ? `${String(a.correct)}${a.tolerance ? ` ± ${a.tolerance}` : ''}`
        : answerLabel(a.kind, a.options, a.correct);
  return (
    <div className="rounded-xl border p-4 break-inside-avoid" data-testid="report-quick-check">
      <p className="mb-1 flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4" aria-hidden /> Q{index} · {label}
        {a.stats.length > 1 && ` · ${a.stats.length} rounds`}
      </p>
      <h3 className="text-lg font-semibold" dir="auto">
        {a.prompt}
      </h3>
      {correct && (
        <p className="mt-1 text-sm" dir="auto">
          Correct answer: <strong className="text-correct">{correct}</strong>
        </p>
      )}
      {a.stats.map((s) => {
        const total = Math.max(1, s.count);
        const rows = a.kind === 'NUMERIC' ? s.distribution.slice(0, 6) : s.distribution;
        return (
          <div key={s.round} className="mt-3">
            <p className="mb-2 text-sm">
              {a.stats.length > 1 && <strong>Round {s.round}: </strong>}
              {s.count} {s.count === 1 ? 'response' : 'responses'} ·{' '}
              <strong>{pct(s.percentCorrect)} correct</strong> · {s.sureWrong} sure and wrong
            </p>
            <ul className="flex flex-col gap-1">
              {rows.map((d) => (
                <li
                  key={String(d.answer)}
                  className="grid grid-cols-[minmax(0,14rem)_1fr_4.5rem] items-center gap-3 text-sm"
                >
                  <span className={cn('truncate', d.correct && 'font-semibold text-correct')} dir="auto">
                    {d.correct && '✓ '}
                    {answerLabel(a.kind, a.options, d.answer)}
                  </span>
                  <span className="h-2.5 overflow-hidden rounded-full bg-muted print:border">
                    <span
                      className={cn('block h-full rounded-full', d.correct ? 'bg-correct' : 'bg-primary/50')}
                      style={{ width: `${(100 * d.count) / total}%` }}
                    />
                  </span>
                  <span className="text-right tabular-nums">
                    {pct((100 * d.count) / total)} <span className="text-muted-foreground">({d.count})</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {a.explanation && (
        <p className="mt-3 text-sm text-muted-foreground" dir="auto">
          Explanation: {a.explanation}
        </p>
      )}
    </div>
  );
}

function ExplainReport({ activity: a, index }: { activity: HostActivity; index: number }) {
  return (
    <div className="rounded-xl border p-4 break-inside-avoid-page">
      <p className="mb-1 text-sm text-muted-foreground">
        Explain {index} · {a.responseCount} {a.responseCount === 1 ? 'answer' : 'answers'}
      </p>
      <h3 className="text-lg font-semibold" dir="auto">
        {a.prompt}
      </h3>
      {a.modelAnswer && (
        <p className="mt-1 text-sm" dir="auto">
          Model answer: <strong>{a.modelAnswer}</strong>
        </p>
      )}
      {a.explainAnswers.length > 0 ? (
        <ul className="mt-3 flex flex-col divide-y rounded-lg border text-sm">
          {a.explainAnswers.map((ans) => (
            <li key={ans.id} className="flex items-start gap-3 px-3 py-2 break-inside-avoid">
              <span className="flex-1" dir="auto">
                {ans.text}
              </span>
              {ans.tag && (
                <span
                  className={cn(
                    'shrink-0 rounded-md px-2 py-0.5 text-xs font-medium',
                    TAG[ans.tag].className,
                  )}
                >
                  {TAG[ans.tag].label}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          {a.status === 'LIVE' ? 'Still collecting answers.' : 'No answers to show.'}
        </p>
      )}
    </div>
  );
}

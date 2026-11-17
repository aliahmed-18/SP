import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toPng } from 'html-to-image';
import { CircleCheck, CircleDashed, Download } from 'lucide-react';
import { toast } from 'sonner';
import type { PublicTakeaway } from '@getit/shared';
import { Spinner, Wordmark } from '@/components/brand/brand';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { getSavedChecks } from '@/lib/local-history';

const until = new Intl.DateTimeFormat('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit' });

/** Spec F / shot 28: the student's Take-away. The Quick Check review is computed on this phone only. */
export function TakeawayView({ code, sessionId, rev }: { code: string; sessionId: string; rev: number }) {
  const q = useQuery({
    queryKey: ['public-takeaway', code, rev],
    queryFn: () => api<PublicTakeaway>(`/public/sessions/${code}/takeaway`),
  });
  const sheet = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);

  if (q.isPending) {
    return (
      <div className="flex justify-center p-10">
        <Spinner label="Loading your Take-away" className="!size-10" />
      </div>
    );
  }
  if (q.isError) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-center">
        <p className="mb-3">Couldn't load the Take-away.</p>
        <Button onClick={() => void q.refetch()}>Retry</Button>
      </div>
    );
  }
  const t = q.data;
  const checks = getSavedChecks(sessionId);
  const correct = checks.filter((c) => c.wasCorrect).length;
  const review = checks.filter((c) => !c.wasCorrect || c.confident !== true);

  /** The image is always the light "paper" version (spec F), whatever the phone's theme. */
  async function saveImage() {
    const node = sheet.current;
    if (!node) return;
    setSaving(true);
    const root = document.documentElement;
    const wasDark = root.classList.contains('dark');
    try {
      root.classList.remove('dark');
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const dataUrl = await toPng(node, { pixelRatio: 2, backgroundColor: '#F8FAFC', cacheBust: true });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `getit-takeaway-${code}.png`;
      a.click();
      toast.success('Image saved');
    } catch {
      toast.error("Couldn't create the image. Try again.");
    } finally {
      if (wasDark) root.classList.add('dark');
      setSaving(false);
    }
  }

  const nav = [
    { id: 'ta-points', label: "Today's key points", n: t.keyPoints.length },
    { id: 'ta-asked', label: 'What the class asked most', n: t.topics.length },
    { id: 'ta-review', label: 'Your Quick Check review', n: review.length },
  ];

  return (
    <div className="flex flex-col gap-4" data-testid="takeaway">
      <div ref={sheet} className="takeaway-light flex flex-col gap-6 rounded-2xl border bg-background p-5">
        <header className="flex items-center gap-3">
          {/* The card is always light "paper", so the letters stay teal even in dark mode. */}
          <Wordmark className="h-8 w-auto !text-[#0F766E]" />
          <span className="border-l pl-3 font-semibold text-primary">Take-away</span>
        </header>
        <h1 className="text-3xl leading-tight font-bold" dir="auto">
          {t.topic}
        </h1>
        <nav aria-label="Sections" className="flex flex-wrap gap-2">
          {nav.map((n) => (
            <a key={n.id} href={`#${n.id}`} className="rounded-full border bg-card px-3 py-1 text-sm">
              {n.label} <span className="ml-1 rounded-full bg-muted px-1.5 text-xs">{n.n}</span>
            </a>
          ))}
        </nav>

        <section id="ta-points" aria-labelledby="ta-points-h" className="flex flex-col gap-3">
          <h2 id="ta-points-h" className="text-2xl font-semibold">
            Today's key points
          </h2>
          <ol className="flex flex-col gap-3">
            {t.keyPoints.map((p, i) => (
              <li key={i} className="flex gap-3 rounded-2xl border bg-card p-4">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                  {i + 1}
                </span>
                <span className="text-lg" dir="auto">
                  {p}
                </span>
              </li>
            ))}
          </ol>
        </section>

        {t.topics.length > 0 && (
          <section id="ta-asked" aria-labelledby="ta-asked-h" className="flex flex-col gap-3">
            <div>
              <h2 id="ta-asked-h" className="text-2xl font-semibold">
                What the class asked most
              </h2>
              <p className="text-muted-foreground">
                The questions most of the class had, with your instructor's answers.
              </p>
            </div>
            {t.topics.map((x, i) => (
              <article key={i} className="rounded-2xl border bg-card p-4">
                <h3 className="text-lg font-semibold" dir="auto">
                  {x.title}
                </h3>
                <p className="mb-2 text-sm text-muted-foreground">
                  {x.meTooCount} {x.meTooCount === 1 ? 'classmate' : 'classmates'} had this question too
                </p>
                {x.reply ? (
                  <div className="rounded-xl bg-accent p-3 text-accent-foreground">
                    <p className="text-xs font-semibold">Instructor's answer</p>
                    <p className="break-words whitespace-pre-wrap" dir="auto">
                      {x.reply}
                    </p>
                  </div>
                ) : x.status === 'ANSWERED_IN_CLASS' ? (
                  <p className="flex gap-2 text-sm text-muted-foreground">
                    <CircleCheck className="size-4 shrink-0 text-primary" aria-hidden /> Answered in class.
                    Check your notes from the lecture.
                  </p>
                ) : (
                  <p className="flex gap-2 text-sm text-muted-foreground">
                    <CircleDashed className="size-4 shrink-0" aria-hidden /> Not answered yet. You can ask
                    your instructor after class.
                  </p>
                )}
              </article>
            ))}
          </section>
        )}

        <section id="ta-review" aria-labelledby="ta-review-h" className="flex flex-col gap-3">
          <h2 id="ta-review-h" className="text-2xl font-semibold">
            Your Quick Check review
          </h2>
          {checks.length > 0 && (
            <div>
              <p className="text-sm text-muted-foreground">
                Quick Checks you answered: {checks.length} · correct: {correct}
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(100 * correct) / checks.length}%` }}
                />
              </div>
            </div>
          )}
          {review.length === 0 ? (
            <p className="rounded-2xl border bg-card p-4">
              {checks.length ? 'Nothing to revisit — well done.' : 'No Quick Check answers on this phone.'}
            </p>
          ) : (
            review.map((c) => (
              <article
                key={`${c.activityId}:${c.round}`}
                className="flex flex-col gap-2 rounded-2xl border bg-card p-4"
                data-testid="review-item"
              >
                <h3 className="font-semibold" dir="auto">
                  {c.question}
                </h3>
                {c.wasCorrect ? (
                  <p className="text-sm text-muted-foreground">
                    You chose the right answer but weren't sure. Worth one more look.
                  </p>
                ) : (
                  <p className="text-sm">
                    Your answer: <span className="text-wrong line-through">{c.myAnswer}</span>
                  </p>
                )}
                <p className="text-sm">
                  Correct answer: <strong className="text-correct">{c.correctAnswer}</strong>
                </p>
                {c.explanation && (
                  <p className="border-l-2 pl-3 text-sm" dir="auto">
                    <span className="block text-xs font-semibold text-muted-foreground">Why</span>
                    {c.explanation}
                  </p>
                )}
              </article>
            ))
          )}
          <p className="text-xs text-muted-foreground">
            Your review is saved only on this phone. Nobody else can see it.
          </p>
        </section>

        <p className="border-t pt-4 text-sm text-muted-foreground">
          This page disappears 24 hours after the lecture ends — available until{' '}
          {until.format(new Date(t.expiresAt))}. Save it to keep it.
        </p>
      </div>
      <Button size="lg" className="h-14 text-base" onClick={() => void saveImage()} disabled={saving}>
        {saving ? <Spinner decorative /> : <Download />} Save as image
      </Button>
    </div>
  );
}

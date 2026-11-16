import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, Check, Hash, Lightbulb, ListChecks, Lock, ToggleLeft } from 'lucide-react';
import { toast } from 'sonner';
import {
  answerLabel,
  isCorrect,
  parseNumericAnswer,
  type Answer,
  type MyResponse,
  type StudentActivity,
} from '@getit/shared';
import { Spinner } from '@/components/brand/brand';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { hasChosenConfidence, markConfidenceChosen, saveCheck } from '@/lib/local-history';
import type { GetitSocket } from '@/lib/socket';
import { cn } from '@/lib/utils';
import { OptionCard, type OptionTone } from './OptionCard';

const HEADER = {
  MCQ: { icon: ListChecks, text: 'Pick one answer' },
  TRUE_FALSE: { icon: ToggleLeft, text: 'True or false?' },
  NUMERIC: { icon: Hash, text: 'Type a number' },
} as const;

type Props = {
  sessionId: string;
  activity: StudentActivity;
  mine: MyResponse | null;
  getSocket: () => GetitSocket | null;
  onMine: (m: MyResponse) => void;
  onBack: () => void;
};

/** The phone's Quick Check screen: answer → "Answer sent" + confidence → reveal (shots 21–26). */
export function ActivityView({ sessionId, activity: a, mine, getSocket, onMine, onBack }: Props) {
  const kind = a.kind ?? 'MCQ';
  const revealed = a.status === 'REVEALED' && a.correct !== undefined;
  const gotIt = revealed && mine ? isCorrect(mine.answer, a.correct!, kind, a.tolerance ?? null) : null;
  const Icon = HEADER[kind].icon;

  // Each new state (question opens, closes, answer shown) starts at the top so the heading is visible.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [a.id, a.round, a.status]);

  // Keep the revealed result on this phone for the Take-away review (spec F).
  useEffect(() => {
    if (!revealed || !mine) return;
    saveCheck(sessionId, {
      activityId: a.id,
      round: mine.round,
      question: a.prompt,
      myAnswer: answerLabel(kind, a.options, mine.answer),
      correctAnswer:
        answerLabel(kind, a.options, a.correct!) +
        (kind === 'NUMERIC' && a.tolerance ? ` (± ${a.tolerance})` : ''),
      explanation: a.explanation ?? '',
      confident: mine.confident,
      wasCorrect: !!gotIt,
    });
  }, [revealed, mine, sessionId, a, kind, gotIt]);

  async function send(answer: Answer) {
    const socket = getSocket();
    if (!socket?.connected) return toast.error("You're offline. Try again in a moment.");
    try {
      const res = await socket
        .timeout(8000)
        .emitWithAck('activity:answer', { activityId: a.id, round: a.round, answer });
      if (res.ok) onMine(res.data);
      else toast.error(res.error.message);
    } catch {
      toast.error("Couldn't send. Check your connection and try again.");
    }
  }

  return (
    <section className="fade-in flex flex-col gap-5" aria-labelledby="qc-prompt" data-testid="activity-view">
      {revealed ? (
        <p
          className={cn(
            'w-fit rounded-full px-4 py-1 text-lg font-semibold',
            gotIt === true && 'bg-correct/15 text-correct',
            gotIt === false && 'bg-wrong/15 text-wrong',
            gotIt === null && 'bg-muted text-muted-foreground',
          )}
          role="status"
        >
          {gotIt === true
            ? 'You got it'
            : gotIt === false
              ? 'Not quite — here’s why'
              : 'You didn’t answer this one'}
        </p>
      ) : (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Icon className="size-5" aria-hidden /> {HEADER[kind].text}
          {a.round > 1 && (
            <span className="rounded-full bg-accent px-2 text-sm text-accent-foreground">
              Vote again · round {a.round}
            </span>
          )}
        </p>
      )}
      <h1 id="qc-prompt" className="text-3xl leading-tight font-bold break-words" dir="auto">
        {a.prompt}
      </h1>

      {kind === 'NUMERIC' ? (
        <NumericBlock a={a} mine={mine} revealed={revealed} gotIt={gotIt} onSend={send} />
      ) : (
        <ChoiceBlock a={a} mine={mine} revealed={revealed} onSend={send} />
      )}

      {!revealed && mine && <AnswerSent a={a} mine={mine} getSocket={getSocket} onMine={onMine} />}
      {!revealed && !mine && a.status === 'CLOSED' && (
        <p
          className="flex items-center gap-2 rounded-2xl border bg-card p-4 text-muted-foreground"
          role="status"
        >
          <Lock className="size-5" aria-hidden /> Answering is closed for this question.
        </p>
      )}

      {revealed && a.explanation && (
        <p
          className="flex gap-3 rounded-2xl border border-primary/25 bg-accent p-4 text-lg text-accent-foreground"
          dir="auto"
        >
          <Lightbulb className="mt-1 size-5 shrink-0" aria-hidden /> {a.explanation}
        </p>
      )}
      {(revealed || a.status === 'CLOSED') && (
        <Button variant="outline" size="lg" className="mt-2 h-14 text-base" onClick={onBack}>
          <ArrowLeft /> Back to the lecture
        </Button>
      )}
    </section>
  );
}

function ChoiceBlock({
  a,
  mine,
  revealed,
  onSend,
}: {
  a: StudentActivity;
  mine: MyResponse | null;
  revealed: boolean;
  onSend: (answer: Answer) => Promise<unknown>;
}) {
  const [sending, setSending] = useState<Answer | null>(null);
  const choices: { value: Answer; letter: string; label: string }[] =
    a.kind === 'TRUE_FALSE'
      ? [
          { value: true, letter: 'T', label: 'True' },
          { value: false, letter: 'F', label: 'False' },
        ]
      : a.options.map((o, i) => ({ value: i, letter: String.fromCharCode(65 + i), label: o }));
  const canAnswer = a.status === 'LIVE' && !mine && sending === null;

  return (
    <ul className="flex flex-col gap-3" aria-label="Answers">
      {choices.map((c) => {
        const isMine = mine?.answer === c.value;
        const isRight = revealed && a.correct === c.value;
        let tone: OptionTone = mine || a.status !== 'LIVE' ? 'muted' : 'idle';
        let note: React.ReactNode = null;
        if (revealed) {
          if (isRight) {
            tone = 'correct';
            note = (
              <span className="flex items-center gap-1 font-semibold text-correct">
                <Check className="size-4" /> {isMine ? 'Your answer' : 'Correct'}
              </span>
            );
          } else if (isMine) {
            tone = 'wrong';
            note = <span className="font-semibold text-wrong">Your answer</span>;
          }
        } else if (isMine || sending === c.value) tone = 'selected';
        return (
          <li key={String(c.value)}>
            <OptionCard
              letter={c.letter}
              label={c.label}
              tone={tone}
              note={note}
              disabled={!canAnswer}
              {...(canAnswer
                ? {
                    onClick: async () => {
                      setSending(c.value);
                      await onSend(c.value);
                      setSending(null);
                    },
                  }
                : {})}
            />
          </li>
        );
      })}
    </ul>
  );
}

function NumericBlock({
  a,
  mine,
  revealed,
  gotIt,
  onSend,
}: {
  a: StudentActivity;
  mine: MyResponse | null;
  revealed: boolean;
  gotIt: boolean | null;
  onSend: (answer: Answer) => Promise<unknown>;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const n = parseNumericAnswer(text);
    if (n === null) return setError('Enter a number, e.g. 43.04');
    setError(undefined);
    setSending(true);
    await onSend(n);
    setSending(false);
  }

  if (mine || a.status !== 'LIVE') {
    return (
      <div className="flex flex-col gap-2 rounded-2xl border bg-card p-4 text-lg">
        {mine && (
          <p>
            Your answer:{' '}
            <strong className={cn(revealed && (gotIt ? 'text-correct' : 'text-wrong line-through'))}>
              {String(mine.answer)}
            </strong>
          </p>
        )}
        {revealed && (
          <p>
            Correct answer: <strong className="text-correct">{String(a.correct)}</strong>
            {a.tolerance ? <span className="text-muted-foreground"> (± {a.tolerance})</span> : null}
          </p>
        )}
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      <Input
        aria-label="Your answer"
        placeholder="Your answer"
        inputMode="decimal"
        autoComplete="off"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="h-16 text-center text-3xl font-semibold md:text-3xl"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'numeric-error' : undefined}
      />
      {error && (
        <p id="numeric-error" className="text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="h-14 text-lg" disabled={!text.trim() || sending}>
        {sending && <Spinner decorative />} Send answer
      </Button>
    </form>
  );
}

/** "Answer sent" + "How sure are you?" Sure / Not sure / Skip (shot 22). */
function AnswerSent({
  a,
  mine,
  getSocket,
  onMine,
}: {
  a: StudentActivity;
  mine: MyResponse;
  getSocket: () => GetitSocket | null;
  onMine: (m: MyResponse) => void;
}) {
  const key = `${a.id}:${mine.round}`;
  const [chosen, setChosen] = useState(() => mine.confident !== null || hasChosenConfidence(key));
  const canChange = a.status === 'LIVE' || a.status === 'CLOSED';

  async function choose(confident: boolean | null) {
    const socket = getSocket();
    if (!socket?.connected) return toast.error("You're offline. Try again in a moment.");
    try {
      const res = await socket
        .timeout(8000)
        .emitWithAck('activity:confidence', { activityId: a.id, round: mine.round, confident });
      if (!res.ok) return toast.error(res.error.message);
      markConfidenceChosen(key);
      setChosen(true);
      onMine(res.data);
    } catch {
      toast.error("Couldn't save. Check your connection.");
    }
  }

  return (
    <div
      className="flex flex-col gap-4 rounded-2xl border bg-card p-5"
      role="status"
      data-testid="answer-sent"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-primary">
          <Check className="size-5" aria-hidden />
        </span>
        <div>
          <p className="text-lg font-semibold">Answer sent</p>
          <p className="text-muted-foreground">You'll see the right answer when the instructor shows it.</p>
        </div>
      </div>
      {canChange && (
        <div className="border-t pt-4">
          <p className="mb-3 font-medium" id="sure-label">
            How sure are you?
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="sure-label">
            {(
              [
                { v: true, label: 'Sure' },
                { v: false, label: 'Not sure' },
              ] as const
            ).map(({ v, label }) => (
              <Button
                key={label}
                type="button"
                variant={mine.confident === v ? 'default' : 'outline'}
                aria-pressed={mine.confident === v}
                className="rounded-full px-5"
                onClick={() => void choose(v)}
              >
                {label}
              </Button>
            ))}
            <Button
              type="button"
              variant="ghost"
              aria-pressed={chosen && mine.confident === null}
              className={cn(
                'rounded-full px-5 text-muted-foreground',
                chosen && mine.confident === null && 'bg-muted',
              )}
              onClick={() => void choose(null)}
            >
              Skip
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

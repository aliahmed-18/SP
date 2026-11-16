import { useMemo, useState } from 'react';
import { ClipboardCopy, FolderInput, MessageCircleQuestion, QrCode, Scissors, X } from 'lucide-react';
import { toast } from 'sonner';
import { questionsTsv, type HostQuestion, type HostState } from '@getit/shared';
import { Button } from '@/components/ui/button';
import { copyText } from '@/lib/clipboard';
import { qaApi } from '../qa-api';
import { ConfirmDialog } from './ConfirmDialog';
import { QuestionItem } from './QuestionItem';
import { TopicPickerDialog } from './TopicPickerDialog';

/** List tab (shots 02/03): current part's questions newest first; earlier parts collapsed below. */
export function QuestionsTab({ state, onShowQr }: { state: HostState; onShowQr: () => void }) {
  const { session, parts, questions, topics } = state;
  const ended = session.status === 'ENDED';
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [picker, setPicker] = useState<string[] | null>(null);
  const [removing, setRemoving] = useState<HostQuestion | null>(null);
  const [confirmPart, setConfirmPart] = useState(false);

  const current = parts[parts.length - 1];
  const topicTitle = useMemo(() => new Map(topics.map((t) => [t.id, t.title])), [topics]);
  const byPart = useMemo(() => {
    const m = new Map<string, HostQuestion[]>();
    for (const q of questions) m.set(q.partId, [...(m.get(q.partId) ?? []), q]);
    return m;
  }, [questions]);
  const currentQuestions = current ? (byPart.get(current.id) ?? []) : [];
  const earlier = parts.slice(0, -1).reverse();

  // Selection only makes sense for questions that still exist, all in one part.
  const selectedIds = questions.filter((q) => selected.has(q.id)).map((q) => q.id);
  const selectionPart = questions.find((q) => q.id === selectedIds[0])?.partId;
  const toggle = (q: HostQuestion, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(on && q.partId !== selectionPart ? [] : prev); // switching part clears it
      if (on) next.add(q.id);
      else next.delete(q.id);
      return next;
    });
  const pickerPart = picker ? questions.find((q) => q.id === picker[0])?.partId : undefined;

  async function copyAll() {
    if (questions.length === 0) return toast.info('No questions to copy yet.');
    try {
      await copyText(questionsTsv(parts, topics, questions));
      toast.success(`Copied ${questions.length} questions — paste into Excel`);
    } catch {
      toast.error("Couldn't copy. Try again.");
    }
  }

  const renderItem = (q: HostQuestion) => (
    <QuestionItem
      key={q.id}
      question={q}
      topicTitle={q.topicId ? (topicTitle.get(q.topicId) ?? null) : null}
      selected={selected.has(q.id)}
      onSelect={(on) => toggle(q, on)}
      onGroup={() => setPicker([q.id])}
      onRemove={() => setRemoving(q)}
    />
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap justify-end gap-2">
        {!ended && (
          <Button variant="outline" size="sm" onClick={() => setConfirmPart(true)}>
            <Scissors /> New part
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => void copyAll()}>
          <ClipboardCopy /> Copy questions
        </Button>
      </div>

      {selectedIds.length > 0 && (
        <div
          className="sticky top-2 z-10 flex items-center gap-2 rounded-xl border border-primary/40 bg-card p-2 shadow-md"
          role="region"
          aria-label="Selection"
        >
          <span className="flex-1 pl-2 text-sm font-medium">{selectedIds.length} selected</span>
          <Button size="sm" onClick={() => setPicker(selectedIds)}>
            <FolderInput /> Group into topic
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Clear selection"
            onClick={() => setSelected(new Set())}
          >
            <X className="size-5" />
          </Button>
        </div>
      )}

      {currentQuestions.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label={`Part ${current?.number ?? 1} questions`}>
          {currentQuestions.map(renderItem)}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-xl border p-8 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-accent text-primary">
            <MessageCircleQuestion className="size-6" aria-hidden />
          </span>
          <p className="font-semibold">
            {earlier.length ? 'No questions in this part yet' : 'No questions yet'}
          </p>
          <p className="text-sm text-muted-foreground">
            {ended
              ? 'Nobody asked a question in this part.'
              : 'They appear here as students send them. Show the join code so the class can join.'}
          </p>
          {!ended && (
            <Button variant="outline" onClick={onShowQr}>
              <QrCode /> Show join code
            </Button>
          )}
        </div>
      )}

      {earlier.map((p) => {
        const qs = byPart.get(p.id) ?? [];
        return (
          <details key={p.id} className="group rounded-xl border">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 px-3 text-sm">
              <Scissors className="size-4 text-muted-foreground" aria-hidden />
              <strong>Part {p.number}</strong>
              <span className="text-muted-foreground">
                Questions: {qs.length} · Flagged: {p.flaggedCount}
              </span>
            </summary>
            <ul className="flex flex-col gap-2 p-2 pt-0">{qs.map(renderItem)}</ul>
          </details>
        );
      })}

      <TopicPickerDialog
        code={session.code}
        questionIds={picker ?? []}
        topics={topics.filter((t) => t.partId === pickerPart)}
        open={picker !== null}
        onOpenChange={(o) => !o && setPicker(null)}
        onDone={() => {
          setPicker(null);
          setSelected(new Set());
        }}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove this question?"
        body="It's deleted and counted as flagged. Use this for inappropriate questions. The student isn't told."
        confirm="Remove"
        destructive
        onConfirm={() => removing && void qaApi.remove(removing.id)}
      />
      <ConfirmDialog
        open={confirmPart}
        onOpenChange={setConfirmPart}
        title="Start a new part?"
        body="New questions start a fresh list (e.g. after the break). This part collapses below with its counts."
        confirm="Start new part"
        onConfirm={() => void qaApi.newPart(session.code)}
      />
    </div>
  );
}

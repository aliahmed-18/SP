import { useState, type FormEvent } from 'react';
import { LIMITS, type HostTopic } from '@getit/shared';
import { Spinner } from '@/components/brand/brand';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { qaApi } from '../qa-api';

const NEW = '__new__';

/** "Group into topic": move the selected questions into an existing topic of their part, or a new one. */
export function TopicPickerDialog({
  code,
  questionIds,
  topics,
  open,
  onOpenChange,
  onDone,
}: {
  code: string;
  questionIds: string[];
  topics: HostTopic[]; // topics of the questions' part
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Group into topic</DialogTitle>
          <DialogDescription>
            {questionIds.length === 1 ? '1 question' : `${questionIds.length} questions`} selected. Students
            see only the topic title, never the questions.
          </DialogDescription>
        </DialogHeader>
        <PickerForm
          code={code}
          questionIds={questionIds}
          topics={topics}
          onCancel={() => onOpenChange(false)}
          onDone={onDone}
        />
      </DialogContent>
    </Dialog>
  );
}

function PickerForm({
  code,
  questionIds,
  topics,
  onCancel,
  onDone,
}: {
  code: string;
  questionIds: string[];
  topics: HostTopic[];
  onCancel: () => void;
  onDone: () => void;
}) {
  const [choice, setChoice] = useState<string>(NEW);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (choice === NEW && !title.trim()) return setError('Enter a topic title.');
    setBusy(true);
    const ok =
      choice === NEW
        ? await qaApi.createTopic(code, title.trim(), questionIds)
        : await qaApi.moveToTopic(choice, questionIds);
    setBusy(false);
    if (ok) onDone();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Topic</legend>
        <label
          className={cn(
            'flex min-h-11 cursor-pointer flex-col gap-2 rounded-xl border p-3',
            choice === NEW && 'border-primary bg-accent',
          )}
        >
          <span className="flex items-center gap-3 font-medium">
            <input
              type="radio"
              name="topic"
              checked={choice === NEW}
              onChange={() => setChoice(NEW)}
              className="size-4 accent-primary"
            />
            New topic
          </span>
          {choice === NEW && (
            <Input
              aria-label="New topic title"
              placeholder="e.g. Computing the slope"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setError(undefined);
              }}
              maxLength={LIMITS.topicTitleMax}
              autoFocus
              dir="auto"
              aria-invalid={error ? true : undefined}
            />
          )}
          {error && <span className="text-sm text-destructive">{error}</span>}
        </label>
        {topics.map((t) => (
          <label
            key={t.id}
            className={cn(
              'flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border p-3',
              choice === t.id && 'border-primary bg-accent',
            )}
          >
            <input
              type="radio"
              name="topic"
              checked={choice === t.id}
              onChange={() => setChoice(t.id)}
              className="size-4 accent-primary"
            />
            <span dir="auto">{t.title}</span>
          </label>
        ))}
      </fieldset>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy && <Spinner decorative />} {choice === NEW ? 'Create topic' : 'Move to topic'}
        </Button>
      </DialogFooter>
    </form>
  );
}

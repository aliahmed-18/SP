import { useState, type FormEvent } from 'react';
import {
  Check,
  MessageSquareText,
  MonitorUp,
  MonitorX,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Trash2,
  Users,
} from 'lucide-react';
import { LIMITS, type HostQuestion, type HostTopic } from '@getit/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { emitAck } from '@/lib/emit';
import { cn } from '@/lib/utils';
import { useHost } from '../host-context';
import { qaApi } from '../qa-api';
import { ConfirmDialog } from './ConfirmDialog';
import { RenameTopicDialog } from './RenameTopicDialog';

const STATUS_LABEL = { ANSWERED_IN_CLASS: 'Answered in class', REPLIED: 'Replied' } as const;

/** One topic (shot 02): title, Me too count, its questions, Answered in class / Reply in writing. */
export function TopicCard({
  topic,
  questions,
  nextUp,
}: {
  topic: HostTopic;
  questions: HostQuestion[];
  nextUp: boolean;
}) {
  const [replying, setReplying] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const addressed = topic.status !== 'OPEN';
  const { getSocket, projectedTopicId } = useHost();
  const onProjector = projectedTopicId === topic.id;

  return (
    <article
      className={cn(
        'fade-in rounded-2xl border bg-card p-4',
        nextUp && 'border-primary/50 ring-1 ring-primary/30',
      )}
      aria-labelledby={`topic-${topic.id}`}
      data-testid="host-topic"
    >
      <header className="flex items-start gap-2">
        <h3 id={`topic-${topic.id}`} className="min-w-0 flex-1 pt-1.5 font-semibold break-words" dir="auto">
          {topic.title}
        </h3>
        {nextUp && <Badge className="mt-2">Next up</Badge>}
        {addressed && (
          <Badge variant="accent" className="mt-2">
            <Check aria-hidden /> {STATUS_LABEL[topic.status as keyof typeof STATUS_LABEL]}
          </Badge>
        )}
        <span
          className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-sm font-semibold"
          title="Me too"
        >
          <Users className="size-3.5" aria-hidden /> {topic.meTooCount}
          <span className="sr-only">tapped Me too</span>
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Options for topic ${topic.title}`}>
              <MoreHorizontal className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setRenaming(true)}>
              <Pencil /> Rename
            </DropdownMenuItem>
            {addressed && (
              <DropdownMenuItem onSelect={() => void qaApi.updateTopic(topic.id, { status: 'OPEN' })}>
                <RotateCcw /> Mark as not answered
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
              <Trash2 /> Delete topic
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {questions.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {questions.map((q) => (
            <li key={q.id} className="rounded-lg bg-muted px-3 py-2 text-sm break-words" dir="auto">
              {q.text}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        {questions.length} asked · {topic.meTooCount} tapped “Me too”
      </p>

      {topic.reply && !replying && (
        <div className="mt-3 rounded-lg bg-accent p-3 text-sm text-accent-foreground">
          <p className="mb-1 text-xs font-semibold">Your reply</p>
          <p className="break-words whitespace-pre-wrap" dir="auto">
            {topic.reply}
          </p>
        </div>
      )}

      {replying ? (
        <ReplyForm topic={topic} onClose={() => setReplying(false)} />
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={onProjector ? 'secondary' : 'default'}
            aria-pressed={onProjector}
            onClick={() =>
              void emitAck(getSocket(), 'present:project', {
                item: onProjector ? null : { kind: 'topic', id: topic.id },
              })
            }
          >
            {onProjector ? <MonitorX /> : <MonitorUp />} {onProjector ? 'Stop showing' : 'Show on projector'}
          </Button>
          {topic.status !== 'ANSWERED_IN_CLASS' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void qaApi.updateTopic(
                  topic.id,
                  { status: 'ANSWERED_IN_CLASS' },
                  'Marked as answered in class',
                )
              }
            >
              <Check /> Mark answered
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setReplying(true)}>
            <MessageSquareText /> {topic.reply ? 'Edit reply' : 'Reply in writing'}
          </Button>
        </div>
      )}

      <RenameTopicDialog topic={topic} open={renaming} onOpenChange={setRenaming} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete “${topic.title}”?`}
        body="Its questions stay in the list, ungrouped. Students' “Me too” taps on it are removed."
        confirm="Delete topic"
        destructive
        onConfirm={() => void qaApi.deleteTopic(topic.id)}
      />
    </article>
  );
}

function ReplyForm({ topic, onClose }: { topic: HostTopic; onClose: () => void }) {
  const [text, setText] = useState(topic.reply ?? '');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    const ok = await qaApi.updateTopic(
      topic.id,
      { status: 'REPLIED', reply: text.trim() },
      'Reply sent to students',
    );
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-2">
      <label htmlFor={`reply-${topic.id}`} className="text-sm font-medium">
        Reply in writing
      </label>
      <Textarea
        id={`reply-${topic.id}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={LIMITS.replyMax}
        placeholder="Students see this under the topic, now and in the Take-away."
        autoFocus
        rows={3}
      />
      <div className="flex items-center gap-2">
        <span className="flex-1 text-xs text-muted-foreground">
          {text.length} / {LIMITS.replyMax}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={busy || !text.trim()}>
          Send reply
        </Button>
      </div>
    </form>
  );
}

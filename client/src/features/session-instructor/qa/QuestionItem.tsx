import { Check, FolderInput, FolderMinus, MoreHorizontal, Trash2 } from 'lucide-react';
import type { HostQuestion } from '@getit/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { qaApi } from '../qa-api';

export function QuestionItem({
  question,
  topicTitle,
  selected,
  onSelect,
  onGroup,
  onRemove,
}: {
  question: HostQuestion;
  topicTitle: string | null;
  selected: boolean;
  onSelect: (on: boolean) => void;
  onGroup: () => void;
  onRemove: () => void;
}) {
  const q = question;
  return (
    <li
      className={cn(
        'fade-in flex items-start gap-2 rounded-xl border bg-card p-2 pl-1',
        selected && 'border-primary bg-accent/60',
        q.addressed && 'opacity-70',
      )}
      data-testid="host-question"
    >
      <label className="grid size-11 shrink-0 cursor-pointer place-items-center">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
          className="size-5 accent-primary"
          aria-label={`Select question: ${q.text}`}
        />
      </label>
      <div className="min-w-0 flex-1 py-1.5">
        <p className="text-sm break-words" dir="auto">
          {q.text}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <time dateTime={q.createdAt}>{formatTime(q.createdAt)}</time>
          {topicTitle && (
            <span className="rounded-md bg-accent px-1.5 py-0.5 text-accent-foreground" dir="auto">
              {topicTitle}
            </span>
          )}
        </p>
      </div>
      <Button
        variant={q.addressed ? 'secondary' : 'ghost'}
        size="icon"
        aria-pressed={q.addressed}
        aria-label={q.addressed ? 'Addressed (click to undo)' : 'Mark as addressed'}
        title={q.addressed ? 'Addressed' : 'Mark as addressed'}
        onClick={() => void qaApi.setAddressed(q.id, !q.addressed)}
        className={cn(q.addressed && 'text-primary')}
      >
        <Check className="size-5" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Question options">
            <MoreHorizontal className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onGroup}>
            <FolderInput /> Add to topic…
          </DropdownMenuItem>
          {q.topicId && (
            <DropdownMenuItem onSelect={() => void qaApi.ungroup(q.id)}>
              <FolderMinus /> Remove from topic
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onRemove}>
            <Trash2 /> Remove (inappropriate)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

import { CalendarClock, ChevronRight, MessageCircleQuestion, Users } from 'lucide-react';
import { Link } from 'react-router';
import type { SessionListItem } from '@getit/shared';
import { Badge } from '@/components/ui/badge';
import { lectureTime } from './lecture-time';

const dateFmt = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function SessionList({ sessions }: { sessions: SessionListItem[] }) {
  return (
    <ul className="flex flex-col gap-3" aria-label="Sessions">
      {sessions.map((s) => (
        <li key={s.id}>
          <Link
            to={`/s/${s.code}/host`}
            className="group flex items-center gap-4 rounded-xl border bg-card p-4 shadow-xs transition-colors hover:bg-accent/50"
          >
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                {s.status === 'LIVE' ? (
                  <Badge variant="attention">
                    <span className="size-1.5 rounded-full bg-attention" aria-hidden /> Live · {s.code}
                  </Badge>
                ) : s.status === 'SCHEDULED' ? (
                  <Badge variant="accent">
                    <CalendarClock aria-hidden /> Planned · {s.code}
                  </Badge>
                ) : (
                  <Badge variant="secondary">Ended</Badge>
                )}
                <span className="text-xs text-muted-foreground">{dateFmt.format(lectureTime(s))}</span>
              </div>
              <p className="truncate font-medium" dir="auto">
                {s.topic}
              </p>
            </div>
            <div className="hidden items-center gap-4 text-sm text-muted-foreground sm:flex">
              <span className="flex items-center gap-1.5" title="Joined">
                <Users className="size-4" aria-hidden /> {s.joined} <span className="sr-only">joined</span>
              </span>
              <span className="flex items-center gap-1.5" title="Questions">
                <MessageCircleQuestion className="size-4" aria-hidden /> {s.questions}
                <span className="sr-only">questions</span>
              </span>
            </div>
            <ChevronRight className="size-5 text-muted-foreground group-hover:text-foreground" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

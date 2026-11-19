import { useEffect, useState, type FormEvent } from 'react';
import { CalendarClock, CalendarPlus, Pencil, Play, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { LECTURE_LENGTHS, LIMITS, type HostSession, type HostState } from '@getit/shared';
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
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { api, ApiRequestError } from '@/lib/api';
import { dayKey, fmt, fromInputs, timeValue, untilText } from '@/lib/datetime';
import { ConfirmDialog } from './qa/ConfirmDialog';

const lengthLabel = (m: number) =>
  m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;

/**
 * A planned lecture's page before it starts: when, how it starts, and the actions — Start now, Edit,
 * Add to calendar (.ics), Cancel. The instructor prepares the activities below in the meantime.
 */
export function ScheduledBanner({
  session,
  onStarted,
}: {
  session: HostSession;
  onStarted: (s: HostState) => void;
}) {
  const navigate = useNavigate();
  const at = new Date(session.scheduledFor ?? session.startedAt);
  const [now, setNow] = useState(() => new Date());
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  async function startNow() {
    setBusy(true);
    try {
      onStarted(await api<HostState>(`/sessions/${session.code}/start`, { method: 'POST' }));
      toast.success('The lecture has started — students can join now');
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Couldn't start the lecture.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    try {
      await api(`/sessions/${session.code}`, { method: 'DELETE' });
      toast.success('Lecture cancelled');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Couldn't cancel the lecture.");
    }
  }

  return (
    <section
      aria-labelledby="planned-title"
      className="flex flex-col gap-4 rounded-2xl border border-primary/30 bg-card p-5 shadow-xs"
      data-testid="scheduled-banner"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-primary">
          <CalendarClock className="size-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="planned-title" className="text-lg font-semibold">
            Planned for {fmt.dayTime.format(at)}
            {session.durationMin ? ` · ${lengthLabel(session.durationMin)}` : ''}
          </h2>
          <p className="text-sm text-muted-foreground">
            {session.autoStart
              ? `Starts by itself ${untilText(at, now)}.`
              : `Waits for you to press Start now (planned ${untilText(at, now)}).`}{' '}
            Prepare the activities below. Students who open code <strong>{session.code}</strong> early see a
            waiting screen and join when it starts.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void startNow()} disabled={busy}>
          {busy ? <Spinner decorative /> : <Play />} Start now
        </Button>
        <Button variant="outline" onClick={() => setEditing(true)}>
          <Pencil /> Edit
        </Button>
        <Button asChild variant="outline">
          <a href={`/api/sessions/${session.id}/calendar.ics`} download>
            <CalendarPlus /> Add to calendar
          </a>
        </Button>
        <Button
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={() => setCancelling(true)}
        >
          <Trash2 /> Cancel lecture
        </Button>
      </div>
      {editing && <EditScheduleDialog session={session} onClose={() => setEditing(false)} />}
      <ConfirmDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title="Cancel this lecture?"
        body="It is removed from your calendar, with the activities you prepared for it. This can't be undone."
        confirm="Cancel lecture"
        destructive
        onConfirm={() => void cancel()}
      />
    </section>
  );
}

/** Change topic, time, length and auto-start of a planned lecture. Mount it only while open. */
function EditScheduleDialog({ session, onClose }: { session: HostSession; onClose: () => void }) {
  const start = new Date(session.scheduledFor ?? session.startedAt);
  const [topic, setTopic] = useState(session.topic);
  const [date, setDate] = useState(dayKey(start));
  const [time, setTime] = useState(timeValue(start));
  const [durationMin, setDurationMin] = useState(session.durationMin ?? 75);
  const [autoStart, setAutoStart] = useState(session.autoStart);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    const at = fromInputs(date, time);
    if (!at) return setError('Choose a date and a time.');
    if (at.getTime() < Date.now()) return setError('Choose a time in the future, or press Start now.');
    setSaving(true);
    try {
      await api(`/sessions/${session.code}/schedule`, {
        method: 'PATCH',
        body: JSON.stringify({ topic, scheduledFor: at.toISOString(), durationMin, autoStart }),
      });
      toast.success('Lecture updated');
      onClose();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={(e) => void save(e)} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Edit planned lecture</DialogTitle>
            <DialogDescription>The join code stays the same.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-topic">Lecture topic</Label>
            <Input
              id="edit-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              maxLength={LIMITS.lectureTopicMax}
              dir="auto"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem_8rem]">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-date">Date</Label>
              <Input
                id="edit-date"
                type="date"
                value={date}
                min={dayKey(new Date())}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-time">Time</Label>
              <Input
                id="edit-time"
                type="time"
                step={300}
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-length">Length</Label>
              <select
                id="edit-length"
                value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value))}
                className="h-11 rounded-lg border border-input bg-card px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              >
                {[...new Set([...LECTURE_LENGTHS, durationMin])]
                  .sort((a, b) => a - b)
                  .map((m) => (
                    <option key={m} value={m}>
                      {lengthLabel(m)}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl border p-3">
            <Label htmlFor="edit-auto">Start automatically at this time</Label>
            <Switch id="edit-auto" checked={autoStart} onCheckedChange={setAutoStart} />
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !topic.trim()}>
              {saving && <Spinner decorative />} Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

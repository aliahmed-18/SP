import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { CalendarPlus, Play } from 'lucide-react';
import { toast } from 'sonner';
import { createSessionSchema, LECTURE_LENGTHS, LIMITS, type CourseDto } from '@getit/shared';
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
import { FormField } from '@/features/auth/FormField';
import { ApiRequestError } from '@/lib/api';
import { dayKey, fmt, fromInputs, nextFullHour, sameDay, timeValue } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import { useCreateSession } from './queries';

type Mode = 'now' | 'plan';
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courses: CourseDto[];
  defaultCourseId: string | null;
  /** Calendar: open on "Plan for later", on this day. */
  initialMode?: Mode;
  initialDay?: Date | null;
};

export function StartSessionDialog({
  open,
  onOpenChange,
  courses,
  defaultCourseId,
  initialMode = 'now',
  initialDay = null,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        {/* Mounted only while open, so every open starts from fresh defaults (incl. the selected course). */}
        <StartSessionForm
          courses={courses}
          defaultCourseId={defaultCourseId}
          initialMode={initialMode}
          initialDay={initialDay}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

/** Default plan: the chosen day at the next full hour if that's today, else 09:00 on that day. */
function defaultStart(day: Date | null) {
  const next = nextFullHour();
  if (!day || sameDay(day, next) || day < next) return next;
  const d = new Date(day);
  d.setHours(9, 0, 0, 0);
  return d;
}

function StartSessionForm({
  courses,
  defaultCourseId,
  initialMode,
  initialDay,
  onCancel,
}: Pick<Props, 'courses' | 'defaultCourseId'> & {
  initialMode: Mode;
  initialDay: Date | null;
  onCancel: () => void;
}) {
  const create = useCreateSession();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [topic, setTopic] = useState('');
  const [academicMode, setAcademicMode] = useState(true);
  const [courseId, setCourseId] = useState<string>(defaultCourseId ?? '');
  const [start] = useState(() => defaultStart(initialDay));
  const [date, setDate] = useState(() => dayKey(start));
  const [time, setTime] = useState(() => timeValue(start));
  const [durationMin, setDurationMin] = useState<number>(75);
  const [autoStart, setAutoStart] = useState(true);
  const [error, setError] = useState<string>();
  const [timeError, setTimeError] = useState<string>();
  const planning = mode === 'plan';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    let scheduledFor: string | null = null;
    if (planning) {
      const at = fromInputs(date, time);
      if (!at) return setTimeError('Choose a date and a time.');
      if (at.getTime() < Date.now()) return setTimeError('Choose a time in the future, or start now.');
      scheduledFor = at.toISOString();
    }
    setTimeError(undefined);
    const parsed = createSessionSchema.safeParse({
      topic,
      academicMode,
      courseId: courseId || null,
      ...(planning ? { scheduledFor, durationMin, autoStart } : {}),
    });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    setError(undefined);
    try {
      const s = await create.mutateAsync(parsed.data);
      if (planning && scheduledFor)
        toast.success(`Lecture planned for ${fmt.dayTime.format(new Date(scheduledFor))}`, {
          description: 'Prepare its activities now. Students can be given the code in advance.',
        });
      navigate(`/s/${s.code}/host`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>{planning ? 'Plan a lecture' : 'Start a session'}</DialogTitle>
        <DialogDescription>
          {planning
            ? 'Pick a time. Prepare the activities in advance; the lecture starts by itself at its time, or when you press Start now.'
            : "Write the topic of today's lecture. Students join with a 5-letter code."}
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="radiogroup" aria-label="When">
        {(
          [
            ['now', 'Start now', Play],
            ['plan', 'Plan for later', CalendarPlus],
          ] as const
        ).map(([m, label, Icon]) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              'flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors',
              mode === m
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
            data-testid={`mode-${m}`}
          >
            <Icon className="size-4" aria-hidden /> {label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <FormField
          id="topic"
          label="Lecture topic"
          placeholder="e.g. Linear regression and correlation"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          maxLength={LIMITS.lectureTopicMax}
          autoFocus
          dir="auto"
          error={error}
        />
        <p className="self-end text-xs text-muted-foreground" aria-live="polite">
          {topic.length} / {LIMITS.lectureTopicMax}
        </p>
      </div>

      {courses.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="course">Course</Label>
          <select
            id="course"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            className="h-11 rounded-lg border border-input bg-card px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="">No course</option>
          </select>
        </div>
      )}

      {planning && (
        <fieldset className="flex flex-col gap-4 rounded-xl border p-4">
          <legend className="px-1 text-sm font-medium">When</legend>
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem_8rem]">
            <div className="flex flex-col gap-2">
              <Label htmlFor="plan-date">Date</Label>
              <Input
                id="plan-date"
                type="date"
                value={date}
                min={dayKey(new Date())}
                onChange={(e) => setDate(e.target.value)}
                aria-invalid={timeError ? true : undefined}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="plan-time">Time</Label>
              <Input
                id="plan-time"
                type="time"
                step={300}
                value={time}
                onChange={(e) => setTime(e.target.value)}
                aria-invalid={timeError ? true : undefined}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="plan-length">Length</Label>
              <select
                id="plan-length"
                value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value))}
                className="h-11 rounded-lg border border-input bg-card px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              >
                {LECTURE_LENGTHS.map((m) => (
                  <option key={m} value={m}>
                    {m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {timeError && (
            <p className="text-sm text-destructive" role="alert">
              {timeError}
            </p>
          )}
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="auto-start" className="text-base">
                Start automatically at this time
              </Label>
              <p id="auto-start-help" className="mt-1 text-sm text-muted-foreground">
                Off: it waits until you press Start now.
              </p>
            </div>
            <Switch
              id="auto-start"
              checked={autoStart}
              onCheckedChange={setAutoStart}
              aria-describedby="auto-start-help"
            />
          </div>
        </fieldset>
      )}

      <div className="flex items-start justify-between gap-4 rounded-xl border p-4">
        <div>
          <Label htmlFor="academic-mode" className="text-base">
            Academic mode
          </Label>
          <p id="academic-mode-help" className="mt-1 text-sm text-muted-foreground">
            Filters inappropriate questions. Turn off only for informal sessions.
          </p>
        </div>
        <Switch
          id="academic-mode"
          checked={academicMode}
          onCheckedChange={setAcademicMode}
          aria-describedby="academic-mode-help"
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={create.isPending || topic.trim().length === 0}>
          {create.isPending ? <Spinner decorative /> : planning ? <CalendarPlus /> : <Play />}
          {planning ? 'Plan lecture' : 'Start session'}
        </Button>
      </DialogFooter>
    </form>
  );
}

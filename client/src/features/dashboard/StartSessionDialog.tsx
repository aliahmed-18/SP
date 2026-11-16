import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { createSessionSchema, LIMITS, type CourseDto } from '@getit/shared';
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
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { FormField } from '@/features/auth/FormField';
import { ApiRequestError } from '@/lib/api';
import { useCreateSession } from './queries';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courses: CourseDto[];
  defaultCourseId: string | null;
};

export function StartSessionDialog({ open, onOpenChange, courses, defaultCourseId }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start a session</DialogTitle>
          <DialogDescription>
            Write the topic of today's lecture. Students join with a 5-letter code.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so every open starts from fresh defaults (incl. the selected course). */}
        <StartSessionForm
          courses={courses}
          defaultCourseId={defaultCourseId}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function StartSessionForm({
  courses,
  defaultCourseId,
  onCancel,
}: Pick<Props, 'courses' | 'defaultCourseId'> & { onCancel: () => void }) {
  const create = useCreateSession();
  const navigate = useNavigate();
  const [topic, setTopic] = useState('');
  const [academicMode, setAcademicMode] = useState(true);
  const [courseId, setCourseId] = useState<string>(defaultCourseId ?? '');
  const [error, setError] = useState<string>();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = createSessionSchema.safeParse({ topic, academicMode, courseId: courseId || null });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    setError(undefined);
    try {
      const s = await create.mutateAsync(parsed.data);
      navigate(`/s/${s.code}/host`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
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
          {create.isPending && <Spinner decorative />} Start session
        </Button>
      </DialogFooter>
    </form>
  );
}

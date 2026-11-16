import { useState, type FormEvent } from 'react';
import { courseSchema, LIMITS } from '@getit/shared';
import { toast } from 'sonner';
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
import { FormField } from '@/features/auth/FormField';
import { ApiRequestError } from '@/lib/api';
import { useCreateCourse, useRenameCourse } from './queries';

/** Create a course, or rename one when `course` is given. */
export function CourseDialog({
  open,
  onOpenChange,
  course,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course?: { id: string; name: string } | undefined;
  onCreated?: (id: string) => void;
}) {
  const create = useCreateCourse();
  const rename = useRenameCourse();
  const [error, setError] = useState<string>();
  const busy = create.isPending || rename.isPending;
  const setOpen = (o: boolean) => {
    if (!o) setError(undefined); // next open starts clean
    onOpenChange(o);
  };

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = courseSchema.safeParse({ name: new FormData(e.currentTarget).get('name') });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    setError(undefined);
    try {
      if (course) {
        await rename.mutateAsync({ id: course.id, name: parsed.data.name });
        toast.success('Course renamed');
      } else {
        const created = await create.mutateAsync(parsed.data.name);
        onCreated?.(created.id);
        toast.success('Course created');
      }
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{course ? 'Rename course' : 'New course'}</DialogTitle>
          <DialogDescription>
            Group your lectures by course, e.g. “ITCS 444 — Mobile Development”.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <FormField
            id="course-name"
            name="name"
            label="Course name"
            defaultValue={course?.name ?? ''}
            maxLength={LIMITS.courseNameMax}
            autoFocus
            error={error}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Spinner decorative />} {course ? 'Save' : 'Create course'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

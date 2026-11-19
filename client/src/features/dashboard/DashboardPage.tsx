import { useMemo, useState } from 'react';
import { CalendarPlus, FolderPlus, MoreHorizontal, Pencil, Play, Trash2 } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { LoadingState } from '@/components/brand/brand';
import { AppHeader } from '@/components/layout/AppHeader';
import { ErrorState } from '@/components/layout/ErrorState';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserMenu } from '@/features/auth/UserMenu';
import { useMe } from '@/features/auth/use-me';
import { fmt } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import { CalendarView } from './CalendarView';
import { CourseDialog } from './CourseDialog';
import { useCourses, useDeleteCourse, useSessions } from './queries';
import { LectureList } from './LectureList';
import { LiveNow, NextUp } from './NextUp';
import { StartSessionDialog } from './StartSessionDialog';

const NO_COURSE = 'none';
const ALL = 'all';

export function DashboardPage() {
  const me = useMe();
  const courses = useCourses();
  const sessions = useSessions();
  const deleteCourse = useDeleteCourse();
  const [params, setParams] = useSearchParams();
  const [courseDialog, setCourseDialog] = useState<'new' | 'rename' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  /** Calendar: the dialog opens on "Plan for later" for this day. */
  const [planDay, setPlanDay] = useState<Date | null>(null);
  const [planMode, setPlanMode] = useState<'now' | 'plan'>('now');
  const openStart = (mode: 'now' | 'plan', day: Date | null = null) => {
    setPlanMode(mode);
    setPlanDay(day);
    setStartOpen(true);
  };

  const orphanSessions = useMemo(() => (sessions.data ?? []).filter((s) => !s.courseId), [sessions.data]);
  const liveSessions = useMemo(
    () => (sessions.data ?? []).filter((s) => s.status === 'LIVE'),
    [sessions.data],
  );

  if (courses.isPending || sessions.isPending) return <LoadingState />;
  if (courses.isError || sessions.isError) {
    return (
      <ErrorState
        title="Couldn't load your dashboard"
        body="Check your connection and try again."
        action={
          <Button onClick={() => void Promise.all([courses.refetch(), sessions.refetch()])}>Retry</Button>
        }
      />
    );
  }

  const requested = params.get('course');
  const selectedId =
    requested && (requested === NO_COURSE || courses.data.some((c) => c.id === requested)) ? requested : ALL;
  const selectedCourse = courses.data.find((c) => c.id === selectedId);
  const visibleSessions =
    selectedId === ALL
      ? sessions.data
      : selectedId === NO_COURSE
        ? orphanSessions
        : sessions.data.filter((s) => s.courseId === selectedId);
  const select = (id: string) => setParams(id === ALL ? {} : { course: id }, { replace: true });

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  })();
  const nextPlanned = sessions.data
    .filter((s) => s.status === 'SCHEDULED' && s.scheduledFor)
    .sort((a, b) => Date.parse(a.scheduledFor!) - Date.parse(b.scheduledFor!))[0];
  const chip = (active: boolean) =>
    cn(
      'flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors',
      active
        ? 'border-primary bg-primary text-primary-foreground'
        : 'bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
    );
  const count = (active: boolean) =>
    cn('text-xs tabular-nums', active ? 'text-primary-foreground/80' : 'text-muted-foreground');

  return (
    <div className="min-h-dvh">
      <AppHeader right={<UserMenu />} />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">
              {greeting}
              {me.data ? `, ${me.data.name}` : ''} · {fmt.longDay.format(new Date())}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">Your lectures</h1>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Button size="lg" variant="outline" onClick={() => openStart('plan')}>
              <CalendarPlus /> Plan a lecture
            </Button>
            <Button size="lg" onClick={() => openStart('now')}>
              <Play /> Start session
            </Button>
          </div>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex min-w-0 flex-col gap-6">
            <LiveNow sessions={liveSessions} />
            <NextUp session={nextPlanned} courses={courses.data} onPlan={() => openStart('plan')} />

            <section aria-labelledby="course-title" className="flex min-w-0 flex-col gap-4">
              <div className="flex items-center gap-2">
                <h2 id="course-title" className="min-w-0 flex-1 truncate text-xl font-semibold">
                  {selectedCourse?.name ?? (selectedId === NO_COURSE ? 'Other sessions' : 'All lectures')}
                </h2>
                {selectedCourse && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Course options">
                        <MoreHorizontal className="size-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setCourseDialog('rename')}>
                        <Pencil /> Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                        <Trash2 /> Delete course
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <Button variant="outline" size="sm" onClick={() => setCourseDialog('new')}>
                  <FolderPlus /> New course
                </Button>
              </div>

              {(courses.data.length > 0 || orphanSessions.length > 0) && (
                <nav aria-label="Courses" className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
                  <ul className="flex gap-2 sm:flex-wrap">
                    <li>
                      <button
                        type="button"
                        className={chip(selectedId === ALL)}
                        aria-current={selectedId === ALL ? 'page' : undefined}
                        onClick={() => select(ALL)}
                      >
                        All <span className={count(selectedId === ALL)}>{sessions.data.length}</span>
                      </button>
                    </li>
                    {courses.data.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className={chip(c.id === selectedId)}
                          aria-current={c.id === selectedId ? 'page' : undefined}
                          onClick={() => select(c.id)}
                        >
                          <span className="max-w-56 truncate">{c.name}</span>
                          <span className={count(c.id === selectedId)}>{c.sessionCount}</span>
                        </button>
                      </li>
                    ))}
                    {orphanSessions.length > 0 && (
                      <li>
                        <button
                          type="button"
                          className={cn(chip(selectedId === NO_COURSE), 'italic')}
                          aria-current={selectedId === NO_COURSE ? 'page' : undefined}
                          onClick={() => select(NO_COURSE)}
                        >
                          Other sessions{' '}
                          <span className={count(selectedId === NO_COURSE)}>{orphanSessions.length}</span>
                        </button>
                      </li>
                    )}
                  </ul>
                </nav>
              )}

              <LectureList
                key={selectedId}
                sessions={visibleSessions}
                courses={courses.data}
                showCourse={selectedId === ALL}
                empty={
                  <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-10 text-center">
                    <p className="font-medium">
                      {sessions.data.length ? 'No lectures in this course yet' : 'Welcome to Getit'}
                    </p>
                    <p className="max-w-sm text-sm text-muted-foreground">
                      {sessions.data.length
                        ? 'Start a session when your lecture begins, or plan one ahead.'
                        : 'Create a course for your lectures, start a session right away, or plan one ahead.'}
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button variant="outline" onClick={() => openStart('plan')}>
                        <CalendarPlus /> Plan a lecture
                      </Button>
                      <Button onClick={() => openStart('now')}>
                        <Play /> Start session
                      </Button>
                    </div>
                  </div>
                }
              />
            </section>
          </div>

          <aside className="lg:sticky lg:top-6" aria-label="Calendar">
            <CalendarView sessions={sessions.data} onPlan={(day) => openStart('plan', day)} />
          </aside>
        </div>
      </main>

      <CourseDialog
        open={courseDialog !== null}
        onOpenChange={(o) => !o && setCourseDialog(null)}
        course={courseDialog === 'rename' ? selectedCourse : undefined}
        onCreated={select}
      />
      <StartSessionDialog
        open={startOpen}
        onOpenChange={setStartOpen}
        courses={courses.data}
        defaultCourseId={selectedCourse?.id ?? (selectedId === ALL ? (courses.data[0]?.id ?? null) : null)}
        initialMode={planMode}
        initialDay={planDay}
      />
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{selectedCourse?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Its sessions are kept and move to “Other sessions”. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (!selectedCourse) return;
                deleteCourse.mutate(selectedCourse.id, {
                  onSuccess: () => {
                    toast.success('Course deleted');
                    setParams({}, { replace: true });
                  },
                  onError: () => toast.error("Couldn't delete the course. Try again."),
                });
              }}
            >
              Delete course
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

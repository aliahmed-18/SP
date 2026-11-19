import { useMemo, useState } from 'react';
import { CalendarPlus, FolderPlus, MoreHorizontal, Pencil, Play, Radio, Trash2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
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
import { cn } from '@/lib/utils';
import { CalendarView } from './CalendarView';
import { CourseDialog } from './CourseDialog';
import { useCourses, useDeleteCourse, useSessions } from './queries';
import { SessionList } from './SessionList';
import { StartSessionDialog } from './StartSessionDialog';
import { UpcomingList } from './UpcomingList';

const NO_COURSE = 'none';

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
    requested && (requested === NO_COURSE || courses.data.some((c) => c.id === requested))
      ? requested
      : (courses.data[0]?.id ?? (orphanSessions.length ? NO_COURSE : null));
  const selectedCourse = courses.data.find((c) => c.id === selectedId);
  const visibleSessions =
    selectedId === NO_COURSE ? orphanSessions : sessions.data.filter((s) => s.courseId === selectedId);
  const select = (id: string) => setParams({ course: id }, { replace: true });

  return (
    <div className="min-h-dvh">
      <AppHeader right={<UserMenu />} />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-muted-foreground">Welcome{me.data ? `, ${me.data.name}` : ''}</p>
            <h1 className="text-3xl font-semibold">Your lectures</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="lg" variant="outline" onClick={() => openStart('plan')}>
              <CalendarPlus /> Plan a lecture
            </Button>
            <Button size="lg" onClick={() => openStart('now')}>
              <Play /> Start session
            </Button>
          </div>
        </div>

        {liveSessions.length > 0 && (
          <section aria-label="Live now" className="mb-6 flex flex-col gap-2">
            {liveSessions.map((s) => (
              <Link
                key={s.id}
                to={`/s/${s.code}/host`}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-attention/40 bg-attention/10 p-4 hover:bg-attention/15"
              >
                <Radio className="size-5 text-attention-foreground dark:text-attention" aria-hidden />
                <span className="font-medium">Live now:</span>
                <span className="min-w-0 flex-1 truncate" dir="auto">
                  {s.topic}
                </span>
                <span className="font-semibold tracking-widest">{s.code}</span>
                <span className="text-sm font-medium text-primary">Open →</span>
              </Link>
            ))}
          </section>
        )}

        {/* Calendar: every lecture by day; plan new ones; the next planned ones beside it. */}
        <div className="mb-8 grid gap-6 lg:grid-cols-[1fr_22rem]">
          <CalendarView sessions={sessions.data} onPlan={(day) => openStart('plan', day)} />
          <UpcomingList sessions={sessions.data} courses={courses.data} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
          <nav aria-label="Courses" className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground">Courses</h2>
              <Button variant="ghost" size="sm" onClick={() => setCourseDialog('new')}>
                <FolderPlus /> New course
              </Button>
            </div>
            {courses.data.length === 0 && (
              <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                No courses yet. Create one to group your lectures.
              </p>
            )}
            <ul className="flex flex-col gap-1">
              {courses.data.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => select(c.id)}
                    aria-current={c.id === selectedId ? 'page' : undefined}
                    className={cn(
                      'flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm',
                      c.id === selectedId ? 'bg-accent font-medium text-accent-foreground' : 'hover:bg-muted',
                    )}
                  >
                    <span className="truncate">{c.name}</span>
                    <span className="text-xs text-muted-foreground">{c.sessionCount}</span>
                  </button>
                </li>
              ))}
              {orphanSessions.length > 0 && (
                <li>
                  <button
                    type="button"
                    onClick={() => select(NO_COURSE)}
                    aria-current={selectedId === NO_COURSE ? 'page' : undefined}
                    className={cn(
                      'flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm italic',
                      selectedId === NO_COURSE
                        ? 'bg-accent font-medium text-accent-foreground'
                        : 'hover:bg-muted',
                    )}
                  >
                    <span>Other sessions</span>
                    <span className="text-xs text-muted-foreground">{orphanSessions.length}</span>
                  </button>
                </li>
              )}
            </ul>
          </nav>

          <section aria-labelledby="course-title" className="min-w-0">
            {selectedId ? (
              <>
                <div className="mb-4 flex items-center gap-2">
                  <h2 id="course-title" className="min-w-0 flex-1 truncate text-xl font-semibold">
                    {selectedCourse?.name ?? 'Other sessions'}
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
                </div>
                {visibleSessions.length ? (
                  <SessionList sessions={visibleSessions} />
                ) : (
                  <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-10 text-center">
                    <p className="font-medium">No sessions yet</p>
                    <p className="text-sm text-muted-foreground">Start a session when your lecture begins.</p>
                    <Button onClick={() => openStart('now')}>
                      <Play /> Start session
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-10 text-center">
                <h2 id="course-title" className="font-medium">
                  Welcome to Getit
                </h2>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Create a course for your lectures, or start a session right away.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="outline" onClick={() => setCourseDialog('new')}>
                    <FolderPlus /> New course
                  </Button>
                  <Button onClick={() => openStart('now')}>
                    <Play /> Start session
                  </Button>
                </div>
              </div>
            )}
          </section>
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
        defaultCourseId={selectedCourse?.id ?? null}
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

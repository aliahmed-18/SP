import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CourseDto, CreatedSession, CreateSessionInput, SessionListItem } from '@getit/shared';
import { api } from '@/lib/api';

export const coursesKey = ['courses'] as const;
export const sessionsKey = ['sessions'] as const;

export const useCourses = () =>
  useQuery({ queryKey: coursesKey, queryFn: () => api<CourseDto[]>('/courses') });

/** All of this instructor's sessions (newest first); grouped by course on the client. */
export const useSessions = () =>
  useQuery({
    queryKey: sessionsKey,
    queryFn: () => api<SessionListItem[]>('/sessions'),
    refetchInterval: 30_000,
  });

function useInvalidateAll() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: coursesKey }),
      qc.invalidateQueries({ queryKey: sessionsKey }),
    ]);
}

export function useCreateCourse() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (name: string) =>
      api<CourseDto>('/courses', { method: 'POST', body: JSON.stringify({ name }) }),
    onSuccess: invalidate,
  });
}

export function useRenameCourse() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api<void>(`/courses/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
    onSuccess: invalidate,
  });
}

export function useDeleteCourse() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/courses/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

export function useCreateSession() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (input: CreateSessionInput) =>
      api<CreatedSession>('/sessions', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: invalidate,
  });
}

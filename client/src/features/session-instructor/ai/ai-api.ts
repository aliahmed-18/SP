import { useQuery } from '@tanstack/react-query';
import type {
  AiGenerateInput,
  AiJob,
  AiGradeJob,
  AiGroupJob,
  AiKeyPointsResult,
  AiGradeResult,
  AiStatus,
} from '@getit/shared';
import { api } from '@/lib/api';

/** Whether the server has an AI key. Without one the AI buttons stay hidden (manual flow only). */
export function useAiEnabled() {
  const q = useQuery({
    queryKey: ['ai-status'],
    queryFn: () => api<AiStatus>('/ai/status'),
    staleTime: Infinity,
    retry: false,
  });
  return q.data?.enabled === true;
}

export const aiApi = {
  /** Starts generation in the background; drafts arrive in the activities list as AI drafts. */
  generate: (code: string, input: AiGenerateInput) =>
    api<{ job: AiJob }>(`/sessions/${code}/ai/generate`, { method: 'POST', body: JSON.stringify(input) }),
  confirm: (activityId: string) => api(`/activities/${activityId}/confirm`, { method: 'POST' }),
  confirmAll: (code: string) =>
    api<{ confirmed: number }>(`/sessions/${code}/activities/confirm-ai`, { method: 'POST' }),
  keyPoints: (code: string) => api<AiKeyPointsResult>(`/sessions/${code}/ai/keypoints`, { method: 'POST' }),
  gradeAnswers: (activityId: string) =>
    api<AiGradeResult>(`/activities/${activityId}/ai/grade`, { method: 'POST' }),
  /** Starts "Group with AI" in the background; the suggestions pop up when ready (HostState.aiGroup). */
  group: (code: string) => api<{ job: AiGroupJob }>(`/sessions/${code}/ai/group`, { method: 'POST' }),
  dismissGroup: (code: string) => api(`/sessions/${code}/ai/group/dismiss`, { method: 'POST' }),
  /** "Grade all written answers" in the background (HostState.aiGrade). */
  gradeAll: (code: string) => api<{ job: AiGradeJob }>(`/sessions/${code}/ai/grade-all`, { method: 'POST' }),
};

/** Shown wherever text leaves for the AI service (honest + what professors will ask about). */
export const AI_PRIVACY_NOTE =
  'Text is sent to Google Gemini without any student identity. Nothing changes until you confirm.';

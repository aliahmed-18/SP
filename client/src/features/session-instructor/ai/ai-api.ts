import { useQuery } from '@tanstack/react-query';
import type {
  AiGenerateInput,
  AiGenerateResult,
  AiGroupResult,
  AiKeyPointsResult,
  AiSortResult,
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
  keyPoints: (code: string) => api<AiKeyPointsResult>(`/sessions/${code}/ai/keypoints`, { method: 'POST' }),
  sortAnswers: (activityId: string) =>
    api<AiSortResult>(`/activities/${activityId}/ai/sort`, { method: 'POST' }),
  group: (code: string) => api<AiGroupResult>(`/sessions/${code}/ai/group`, { method: 'POST' }),
  generate: (code: string, input: AiGenerateInput) =>
    api<AiGenerateResult>(`/sessions/${code}/ai/generate`, { method: 'POST', body: JSON.stringify(input) }),
};

/** Shown wherever text leaves for the AI service (honest + what professors will ask about). */
export const AI_PRIVACY_NOTE =
  'Text is sent to Google Gemini without any student identity. Nothing changes until you confirm.';

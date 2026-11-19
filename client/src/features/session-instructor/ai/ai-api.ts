import { useQuery } from '@tanstack/react-query';
import type {
  AiDraft,
  AiGenerateInput,
  AiGenerateLine,
  AiGroupResult,
  AiKeyPointsResult,
  AiSortResult,
  AiStatus,
} from '@getit/shared';
import { api, ApiRequestError } from '@/lib/api';

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
};

/** Shown wherever text leaves for the AI service (honest + what professors will ask about). */
export const AI_PRIVACY_NOTE =
  'Text is sent to Google Gemini without any student identity. Nothing changes until you confirm.';

/**
 * POST …/ai/generate and read its NDJSON stream: `onDrafts` runs as each part of the work finishes, so
 * drafts appear while the rest are still being written. Resolves with the total; throws ApiRequestError.
 */
export async function streamGenerate(
  code: string,
  input: AiGenerateInput,
  onDrafts: (drafts: AiDraft[]) => void,
): Promise<number> {
  let res: Response;
  try {
    res = await fetch(`/api/sessions/${code}/ai/generate`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
  } catch {
    throw new ApiRequestError(0, 'NETWORK', 'No connection. Check your internet and try again.');
  }
  if (!res.ok || !res.body) {
    const err = ((await res.json().catch(() => null)) as { error?: { code: string; message: string } } | null)
      ?.error;
    throw new ApiRequestError(res.status, err?.code ?? 'HTTP_ERROR', err?.message ?? 'Something went wrong.');
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let received = 0;
  for (;;) {
    let chunk: ReadableStreamReadResult<string>;
    try {
      chunk = await reader.read();
    } catch {
      break; // connection dropped: keep what arrived
    }
    buffer += chunk.value ?? '';
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const raw = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!raw) continue;
      const line = JSON.parse(raw) as AiGenerateLine;
      if ('drafts' in line) {
        received += line.drafts.length;
        onDrafts(line.drafts);
      } else if ('error' in line) {
        throw new ApiRequestError(502, line.error.code, line.error.message);
      } else return line.count;
    }
    if (chunk.done) break;
  }
  if (received > 0) return received;
  throw new ApiRequestError(0, 'NETWORK', 'The connection dropped. Try again.');
}

import { toast } from 'sonner';
import type { UpdateTopicInput } from '@getit/shared';
import { api, ApiRequestError } from '@/lib/api';

/** Run a Q&A write; the socket brings the new state, so callers only need errors shown. */
async function run(fn: () => Promise<unknown>, success?: string): Promise<boolean> {
  try {
    await fn();
    if (success) toast.success(success);
    return true;
  } catch (err) {
    toast.error(err instanceof ApiRequestError ? err.message : 'Something went wrong. Try again.');
    return false;
  }
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export const qaApi = {
  setAddressed: (id: string, addressed: boolean) =>
    run(() => api(`/questions/${id}`, json('PATCH', { addressed }))),
  ungroup: (id: string) => run(() => api(`/questions/${id}`, json('PATCH', { topicId: null }))),
  remove: (id: string) => run(() => api(`/questions/${id}`, json('DELETE')), 'Question removed'),
  newPart: (code: string) => run(() => api(`/sessions/${code}/parts`, json('POST')), 'New part started'),
  createTopic: (code: string, title: string, questionIds: string[]) =>
    run(() => api(`/sessions/${code}/topics`, json('POST', { title, questionIds }))),
  moveToTopic: (topicId: string, questionIds: string[]) =>
    run(() => api(`/topics/${topicId}/questions`, json('POST', { questionIds }))),
  updateTopic: (id: string, input: UpdateTopicInput, success?: string) =>
    run(() => api(`/topics/${id}`, json('PATCH', input)), success),
  deleteTopic: (id: string) => run(() => api(`/topics/${id}`, json('DELETE')), 'Topic deleted'),
};

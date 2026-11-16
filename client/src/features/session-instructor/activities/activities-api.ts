import { toast } from 'sonner';
import type { ClientToServerEvents, QuickCheckDraftInput } from '@getit/shared';
import { api, ApiRequestError } from '@/lib/api';
import type { GetitSocket } from '@/lib/socket';

async function rest(fn: () => Promise<unknown>, success?: string): Promise<boolean> {
  try {
    await fn();
    if (success) toast.success(success);
    return true;
  } catch (err) {
    toast.error(err instanceof ApiRequestError ? err.message : 'Something went wrong. Try again.');
    return false;
  }
}

export const activitiesApi = {
  create: (code: string, draft: QuickCheckDraftInput) =>
    rest(
      () => api(`/sessions/${code}/activities`, { method: 'POST', body: JSON.stringify(draft) }),
      'Activity added',
    ),
  edit: (id: string, body: unknown) =>
    rest(() => api(`/activities/${id}`, { method: 'PATCH', body: JSON.stringify(body) }), 'Saved'),
  remove: (id: string) => rest(() => api(`/activities/${id}`, { method: 'DELETE' }), 'Activity deleted'),
  reorder: (code: string, ids: string[]) =>
    rest(() =>
      api(`/sessions/${code}/activities/reorder`, { method: 'POST', body: JSON.stringify({ ids }) }),
    ),
  copyFrom: (code: string, fromSessionId: string) =>
    rest(
      () =>
        api(`/sessions/${code}/activities/copy`, { method: 'POST', body: JSON.stringify({ fromSessionId }) }),
      'Activities copied',
    ),
};

type LifecycleEvent =
  'activity:launch' | 'activity:close' | 'activity:reveal' | 'activity:newRound' | 'activity:undo';

/** Lifecycle actions go over the socket (docs/04); the server's broadcast updates every screen. */
export async function runLifecycle<E extends LifecycleEvent>(
  socket: GetitSocket | null,
  event: E,
  payload: Parameters<ClientToServerEvents[E]>[0],
): Promise<boolean> {
  if (!socket?.connected) {
    toast.error('Reconnecting… try again in a moment.');
    return false;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (socket.timeout(8000) as any).emitWithAck(event, payload);
    if (!res.ok) toast.error(res.error.message);
    return res.ok;
  } catch {
    toast.error('No answer from the server. Check your connection.');
    return false;
  }
}

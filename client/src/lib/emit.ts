import { toast } from 'sonner';
import type { Ack, ClientToServerEvents } from '@getit/shared';
import type { GetitSocket } from './socket';

type AckEvent = {
  [K in keyof ClientToServerEvents]: Parameters<ClientToServerEvents[K]> extends [
    infer _P,
    (res: Ack<infer _R>) => void,
  ]
    ? K
    : never;
}[keyof ClientToServerEvents];

/** Emit a command and wait for its ack; shows the server's message on failure. Returns ok. */
export async function emitAck<E extends AckEvent>(
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
    const res = (await (socket.timeout(8000) as any).emitWithAck(event, payload)) as Ack<unknown>;
    if (!res.ok) toast.error(res.error.message);
    return res.ok;
  } catch {
    toast.error('No answer from the server. Check your connection.');
    return false;
  }
}

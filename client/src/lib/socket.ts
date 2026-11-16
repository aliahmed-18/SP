import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@getit/shared';

export type GetitSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Create a typed socket to the same origin (Vite proxies /socket.io in dev).
 * `auth` is a callback so every reconnect sends fresh credentials (e.g. a new short-lived host token).
 */
export function createSocket(auth?: (cb: (data: object) => void) => void): GetitSocket {
  return io({
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    autoConnect: false,
    ...(auth ? { auth } : {}),
  });
}

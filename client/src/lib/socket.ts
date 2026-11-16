import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketAuth,
  SocketTokenResponse,
} from '@getit/shared';
import { api } from './api';
import { getDeviceId } from './device';

export type GetitSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type LiveRole = SocketAuth['role'];

/**
 * A typed socket to the same origin (Vite proxies /socket.io in dev). The `auth` callback runs on
 * every (re)connect, so hosts always send a fresh 15-minute socket token.
 */
export function createLiveSocket(role: LiveRole, code: string): GetitSocket {
  return io({
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    autoConnect: false,
    reconnectionDelay: 500,
    reconnectionDelayMax: 3000,
    auth: (cb) => {
      if (role === 'student') {
        cb({ role, code, deviceId: getDeviceId() } satisfies SocketAuth);
        return;
      }
      api<SocketTokenResponse>('/auth/socket-token')
        .then(({ token }) => cb({ role, code, token } satisfies SocketAuth))
        // Logged out / offline: send an empty token; the server refuses and the page shows why.
        .catch(() => cb({ role, code, token: '-' } satisfies SocketAuth));
    },
  });
}

import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@getit/shared';
import { env, isProd } from '../env';

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export function createSocketServer(httpServer: HttpServer): IoServer {
  const io: IoServer = new Server(httpServer, {
    // Same origin in dev (Vite proxy) and prod (one service); CORS only matters for direct dev access.
    cors: isProd ? undefined : { origin: env.CLIENT_ORIGIN, credentials: true },
    connectionStateRecovery: undefined, // we rely on full snapshots on every (re)connect instead
  });

  io.on('connection', (socket) => {
    // Phase 1: health round-trip only. Role auth + rooms + snapshots arrive in Phase 2.
    socket.on('system:ping', (ack) => {
      if (typeof ack !== 'function') return;
      ack({ ok: true, data: { serverTime: new Date().toISOString() } });
    });
  });

  return io;
}

import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import {
  rooms,
  SOCKET_REFUSAL,
  socketAuthSchema,
  type ClientToServerEvents,
  type InterServerEvents,
  type ServerToClientEvents,
  type SocketData,
} from '@getit/shared';
import { verifyToken } from '../auth/jwt';
import { prisma } from '../db';
import { env, isProd } from '../env';
import { hashDevice } from '../lib/deviceHash';
import { joinSession } from '../services/participants';
import { findHostSession, findPublicSession } from '../services/sessions';
import { buildHostState, buildPresentState, buildStudentState, setIo } from './broadcast';
import { registerHostHandlers } from './host-handlers';
import { registerStudentHandlers } from './student-handlers';

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export function createSocketServer(httpServer: HttpServer): IoServer {
  const io: IoServer = new Server(httpServer, {
    // Same origin in dev (Vite proxy) and prod (one service); CORS only matters for direct dev access.
    cors: isProd ? undefined : { origin: env.CLIENT_ORIGIN, credentials: true },
    // Notice dead phones (Wi-Fi dropped without a goodbye) within ~25 s instead of the default ~45 s.
    pingInterval: 15_000,
    pingTimeout: 10_000,
  });
  setIo(io);

  // ─── Handshake: validate auth, resolve the session, attach role ──────────
  io.use(async (socket, next) => {
    try {
      const parsed = socketAuthSchema.safeParse(socket.handshake.auth);
      if (!parsed.success) return next(new Error(SOCKET_REFUSAL.invalid));
      const auth = parsed.data;

      if (auth.role === 'student') {
        const session = await findPublicSession(auth.code);
        if (!session) return next(new Error(SOCKET_REFUSAL.notFound));
        socket.data = { role: 'student', sessionId: session.id, deviceHash: hashDevice(auth.deviceId) };
        return next();
      }

      const instructorId = verifyToken(auth.token, 'socket');
      if (!instructorId) return next(new Error(SOCKET_REFUSAL.forbidden));
      const session = await findHostSession(instructorId, auth.code);
      if (!session) return next(new Error(SOCKET_REFUSAL.forbidden)); // not theirs (or no such code)
      socket.data = { role: auth.role, sessionId: session.id, instructorId };
      return next();
    } catch (err) {
      console.error('[getit] socket handshake failed', err);
      return next(new Error('INTERNAL'));
    }
  });

  io.on('connection', (socket) => {
    void onConnection(socket);
  });

  return io;
}

async function onConnection(socket: IoSocket) {
  const { role, sessionId, deviceHash } = socket.data;

  socket.on('system:ping', (ack) => {
    if (typeof ack !== 'function') return;
    ack({ ok: true, data: { serverTime: new Date().toISOString() } });
  });

  socket.on('state:request', async (ack) => {
    try {
      await sendSnapshot(socket);
      if (typeof ack === 'function') ack({ ok: true, data: undefined });
    } catch (err) {
      console.error('[getit] state:request failed', err);
      if (typeof ack === 'function')
        ack({ ok: false, error: { code: 'INTERNAL', message: 'Please try again.' } });
    }
  });

  registerStudentHandlers(socket);
  registerHostHandlers(socket);

  try {
    if (role === 'student') {
      await socket.join(rooms.students(sessionId));
      // A phone that opens the link directly (or after a refresh) is registered here too. Idempotent.
      const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { status: true } });
      if (session?.status === 'LIVE' && deviceHash) await joinSession(sessionId, deviceHash);
    } else {
      await socket.join(role === 'host' ? rooms.host(sessionId) : rooms.present(sessionId));
    }
    await sendSnapshot(socket); // rule 7: full snapshot on every (re)connect
  } catch (err) {
    console.error('[getit] socket connection setup failed', err);
    socket.disconnect(true);
  }
}

async function sendSnapshot(socket: IoSocket) {
  const { role, sessionId, deviceHash } = socket.data;
  if (role === 'student') socket.emit('state:student', await buildStudentState(sessionId, deviceHash!));
  else if (role === 'host') socket.emit('state:host', await buildHostState(sessionId));
  else socket.emit('state:present', await buildPresentState(sessionId));
}

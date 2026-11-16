// DTO builders (allow-lists, never spread DB rows) + emit helpers. docs/04 §"Three different views".
import { rooms, type HostState, type PresentState, type StudentState } from '@getit/shared';
import type { Session } from '@prisma/client';
import { prisma } from '../db';
import { bus } from '../lib/bus';
import { countJoined } from '../services/participants';
import type { IoServer } from './socket';

let io: IoServer | null = null;
/** Set once at startup. REST-only tests run without it; emits are then no-ops. */
export function setIo(server: IoServer | null) {
  io = server;
}

async function loadSession(sessionId: string): Promise<Session> {
  return prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
}

export async function buildHostState(sessionId: string): Promise<HostState> {
  const s = await loadSession(sessionId);
  return {
    version: s.version,
    session: {
      id: s.id,
      code: s.code,
      topic: s.topic,
      status: s.status,
      academicMode: s.academicMode,
      joinedCount: await countJoined(s.id),
      flaggedCount: s.flaggedCount,
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt?.toISOString() ?? null,
      courseId: s.courseId,
    },
    parts: [],
    questions: [],
    topics: [],
    activities: [],
    liveActivityId: s.liveActivityId,
  };
}

export async function buildPresentState(sessionId: string): Promise<PresentState> {
  const s = await loadSession(sessionId);
  return {
    version: s.version,
    session: { code: s.code, topic: s.topic, status: s.status, joinedCount: await countJoined(s.id) },
    activities: [],
    liveActivityId: s.liveActivityId,
    projected: null,
  };
}

/** `deviceHash` is used only to look up this device's own data; it is never part of the payload. */
export async function buildStudentState(sessionId: string, _deviceHash: string): Promise<StudentState> {
  const s = await loadSession(sessionId);
  const takeaway = await prisma.takeaway.findUnique({ where: { sessionId }, select: { status: true } });
  return {
    version: s.version,
    session: { id: s.id, topic: s.topic, status: s.status },
    liveActivity: null,
    myResponse: null,
    myQuestions: [],
    topics: [],
    takeawayPublished: takeaway?.status === 'PUBLISHED',
  };
}

// ─── Emit helpers ───────────────────────────────────────────────────────────

// Domain events → socket events (raised by services after their transaction committed). Registered once.
bus.on('session:joined', ({ sessionId, joinedCount }) => emitJoined(sessionId, joinedCount));
bus.on('session:ended', ({ sessionId, endedAt }) => {
  emitSessionEnded(sessionId, endedAt).catch((err) => console.error('[getit] emit ended failed', err));
});

export function emitJoined(sessionId: string, joinedCount: number) {
  io?.to([rooms.host(sessionId), rooms.present(sessionId)]).emit('session:joined', { joinedCount });
}

export async function emitSessionEnded(sessionId: string, endedAt: Date) {
  const server = io;
  if (!server) return;
  const payload = { endedAt: endedAt.toISOString() };
  server
    .to([rooms.host(sessionId), rooms.present(sessionId), rooms.students(sessionId)])
    .emit('session:ended', payload);
  // Fresh snapshots so every screen shows the ended state without another round-trip.
  await emitSnapshots(sessionId);
}

/** Send every connected client of a session its own snapshot (students get per-device state). */
export async function emitSnapshots(sessionId: string) {
  const server = io; // capture: a shutdown may clear `io` while we await
  if (!server) return;
  const [host, present] = await Promise.all([buildHostState(sessionId), buildPresentState(sessionId)]);
  server.to(rooms.host(sessionId)).emit('state:host', host);
  server.to(rooms.present(sessionId)).emit('state:present', present);
  const students = await server.in(rooms.students(sessionId)).fetchSockets();
  await Promise.all(
    students.map(async (sock) => {
      if (sock.data.deviceHash)
        sock.emit('state:student', await buildStudentState(sessionId, sock.data.deviceHash));
    }),
  );
}

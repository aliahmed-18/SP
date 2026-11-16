// DTO builders (allow-lists, never spread DB rows) + emit helpers. docs/04 §"Three different views".
import {
  rooms,
  sortTopics,
  type HostState,
  type PresentState,
  type PublicTopic,
  type ServerToClientEvents,
  type StudentState,
} from '@getit/shared';
import type { Session } from '@prisma/client';
import { prisma } from '../db';
import { bus } from '../lib/bus';
import { countJoined } from '../services/participants';
import { toHostPart, toHostQuestion, toHostTopic, toPublicTopic } from './dto';
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
  const [parts, questions, topics] = await Promise.all([
    prisma.part.findMany({ where: { sessionId }, orderBy: { number: 'asc' } }),
    prisma.question.findMany({ where: { sessionId }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] }),
    prisma.topic.findMany({ where: { sessionId }, orderBy: { createdAt: 'asc' } }),
  ]);
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
    parts: parts.map(toHostPart),
    questions: questions.map(toHostQuestion),
    topics: topics.map(toHostTopic),
    activities: [],
    liveActivityId: s.liveActivityId,
  };
}

/** The class's topic list as students see it, sorted (Me too, then question count). */
export async function buildPublicTopics(sessionId: string): Promise<PublicTopic[]> {
  const topics = await prisma.topic.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { questions: true } } },
  });
  const dtos = topics.map((t) => toPublicTopic(t, t._count.questions));
  return sortTopics(
    dtos,
    dtos.flatMap((t) => Array.from({ length: t.questionCount }, () => ({ topicId: t.id }))),
  );
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
export async function buildStudentState(sessionId: string, deviceHash: string): Promise<StudentState> {
  const s = await loadSession(sessionId);
  const [takeaway, topics, mine] = await Promise.all([
    prisma.takeaway.findUnique({ where: { sessionId }, select: { status: true } }),
    buildPublicTopics(sessionId),
    prisma.meToo.findMany({ where: { deviceHash, topic: { sessionId } }, select: { topicId: true } }),
  ]);
  const meToo = new Set(mine.map((m) => m.topicId));
  return {
    version: s.version,
    session: { id: s.id, topic: s.topic, status: s.status },
    liveActivity: null,
    myResponse: null,
    topics: topics.map((t) => ({ ...t, iMeToo: meToo.has(t.id) })),
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

// ─── Q&A emits (after the transaction committed) ─────────────────────────────

type HostEvent = 'question:new' | 'question:updated' | 'question:removed' | 'qa:flagged' | 'topics:host';

export function emitToHost<E extends HostEvent>(
  sessionId: string,
  event: E,
  ...payload: Parameters<ServerToClientEvents[E]>
) {
  io?.to(rooms.host(sessionId)).emit(event, ...payload);
}

/** Structural change (topics created/moved/deleted, new part): the host gets a fresh snapshot. */
export async function emitHostSnapshot(sessionId: string) {
  const server = io;
  if (!server) return;
  server.to(rooms.host(sessionId)).emit('state:host', await buildHostState(sessionId));
}

/** Students' topic list changed (title, status, reply, Me too, membership). */
export async function emitStudentTopics(sessionId: string) {
  const server = io;
  if (!server) return;
  server.to(rooms.students(sessionId)).emit('topics:updated', { topics: await buildPublicTopics(sessionId) });
}

/** Me too changed counts only: lightweight update for the host + the class list for students. */
export async function emitTopicCounts(sessionId: string, version: number) {
  const server = io;
  if (!server) return;
  const topics = await prisma.topic.findMany({ where: { sessionId }, orderBy: { createdAt: 'asc' } });
  server.to(rooms.host(sessionId)).emit('topics:host', { version, topics: topics.map(toHostTopic) });
  await emitStudentTopics(sessionId);
}

/** Log and swallow emit failures: the DB write already succeeded, clients resync on the next snapshot. */
export function safeEmit(p: Promise<unknown>) {
  p.catch((err) => console.error('[getit] emit failed', err));
}

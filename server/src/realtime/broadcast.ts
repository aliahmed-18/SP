// DTO builders (allow-lists, never spread DB rows) + emit helpers. docs/04 §"Three different views".
import { jobFor } from '../services/ai-job-store';
import {
  rooms,
  sortTopics,
  type HostState,
  type PresentState,
  type PublicTopic,
  type ServerToClientEvents,
  type StudentState,
} from '@getit/shared';
import type { Activity, Session } from '@prisma/client';
import { prisma } from '../db';
import { bus } from '../lib/bus';
import { activityResults } from '../services/activities';
import { countJoined } from '../services/participants';
import { buildProjectedView, readProjected, readSettings } from '../services/presentation';
import { countResponses, myResponse } from '../services/responses';
import {
  toHostActivity,
  toHostPart,
  toHostQuestion,
  toHostTopic,
  toPresentActivity,
  toPublicTopic,
  toStudentActivity,
} from './dto';
import type { IoServer } from './socket';

let io: IoServer | null = null;
/** Set once at startup. REST-only tests run without it; emits are then no-ops. */
export function setIo(server: IoServer | null) {
  io = server;
}

async function loadSession(sessionId: string): Promise<Session> {
  return prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
}

const loadActivities = (sessionId: string) =>
  prisma.activity.findMany({ where: { sessionId }, orderBy: { position: 'asc' } });

/** What phones show: the activity on stage, unless it is a draft (or the session ended). */
async function stageActivity(s: Session): Promise<Activity | null> {
  if (!s.presentActivityId || s.status !== 'LIVE') return null;
  const a = await prisma.activity.findUnique({ where: { id: s.presentActivityId } });
  return a && a.status !== 'DRAFT' ? a : null;
}

export async function buildHostState(sessionId: string): Promise<HostState> {
  const s = await loadSession(sessionId);
  const [parts, questions, topics, activities] = await Promise.all([
    prisma.part.findMany({ where: { sessionId }, orderBy: { number: 'asc' } }),
    prisma.question.findMany({ where: { sessionId }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] }),
    prisma.topic.findMany({ where: { sessionId }, orderBy: { createdAt: 'asc' } }),
    loadActivities(sessionId),
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
      scheduledFor: s.scheduledFor?.toISOString() ?? null,
      durationMin: s.durationMin,
      autoStart: s.autoStart,
    },
    parts: parts.map(toHostPart),
    questions: questions.map(toHostQuestion),
    topics: topics.map(toHostTopic),
    activities: await Promise.all(activities.map(async (a) => toHostActivity(a, await activityResults(a)))),
    liveActivityId: s.liveActivityId,
    stageActivityId: s.presentActivityId,
    projectedTopicId: projectedId(s, 'topic'),
    projectedAnswerId: projectedId(s, 'misconception'),
    aiJob: jobFor('generate', sessionId),
    aiGroup: jobFor('group', sessionId),
    aiGrade: jobFor('grade', sessionId),
    serverTime: new Date().toISOString(),
  };
}

function projectedId(s: Session, kind: 'topic' | 'misconception'): string | null {
  const item = readProjected(s.projected);
  return item?.kind === kind ? item.id : null;
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
    activities: await Promise.all(
      (await loadActivities(sessionId)).map(async (a) => toPresentActivity(a, await activityResults(a))),
    ),
    liveActivityId: s.liveActivityId,
    stageActivityId: s.presentActivityId,
    projected: await buildProjectedView(s.projected),
    settings: readSettings(s.presentSettings),
    serverTime: new Date().toISOString(),
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
  const stage = await stageActivity(s);
  return {
    version: s.version,
    session: { id: s.id, topic: s.topic, status: s.status },
    liveActivity: stage ? toStudentActivity(stage) : null,
    myResponse: await myResponse(stage, deviceHash),
    topics: topics.map((t) => ({ ...t, iMeToo: meToo.has(t.id) })),
    takeawayPublished: takeaway?.status === 'PUBLISHED',
  };
}

// ─── Emit helpers ───────────────────────────────────────────────────────────

// Domain events → socket events (raised by services after their transaction committed). Registered once.
bus.on('session:joined', ({ sessionId, joinedCount }) => emitJoined(sessionId, joinedCount));
// A planned lecture went LIVE: every open host / projector page gets the live session.
bus.on('session:started', ({ sessionId }) => {
  safeEmit(emitHostSnapshot(sessionId));
  safeEmit(emitPresentSnapshot(sessionId));
});
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

export async function emitPresentSnapshot(sessionId: string) {
  const server = io;
  if (!server) return;
  server.to(rooms.present(sessionId)).emit('state:present', await buildPresentState(sessionId));
}

/** The stage activity changed outside the lifecycle (edited / deleted): phones get its current version. */
export async function emitStudentStage(sessionId: string) {
  const server = io;
  if (!server) return;
  const stage = await stageActivity(await loadSession(sessionId));
  server
    .to(rooms.students(sessionId))
    .emit('activity:student', { activity: stage ? toStudentActivity(stage) : null });
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

/** Phones refetch the published Take-away. */
export function emitTakeawayPublished(sessionId: string) {
  io?.to(rooms.students(sessionId)).emit('takeaway:published');
}

// ─── Activity emits ─────────────────────────────────────────────────────────

/** After a lifecycle change: host (versioned), projector, and every phone (student DTO). */
export async function emitActivityChanged(r: {
  activity: Activity;
  version: number;
  liveActivityId: string | null;
  stageActivityId: string | null;
}) {
  const server = io;
  if (!server) return;
  const { sessionId } = r.activity;
  const results = await activityResults(r.activity);
  const ids = { liveActivityId: r.liveActivityId, stageActivityId: r.stageActivityId };
  server
    .to(rooms.host(sessionId))
    .emit('activity:host', { version: r.version, activity: toHostActivity(r.activity, results), ...ids });
  server.to(rooms.present(sessionId)).emit('activity:present', {
    activity: toPresentActivity(r.activity, results),
    ...ids,
    serverTime: new Date().toISOString(),
  });
  const onStage = r.stageActivityId === r.activity.id && r.activity.status !== 'DRAFT';
  if (onStage) {
    server
      .to(rooms.students(sessionId))
      .emit('activity:student', { activity: toStudentActivity(r.activity) });
  }
}

/** The projected item changed: projector gets the resolved view, host gets a fresh snapshot (topic button). */
export async function emitProjected(sessionId: string) {
  const server = io;
  if (!server) return;
  const s = await loadSession(sessionId);
  server
    .to(rooms.present(sessionId))
    .emit('present:projected', { projected: await buildProjectedView(s.projected) });
  server.to(rooms.host(sessionId)).emit('state:host', await buildHostState(sessionId));
}

// Live answer counts, throttled per activity to at most one emit every 250 ms (≤ 4/s, docs/04).
const STATS_INTERVAL_MS = 250;
const statsTimers = new Map<string, { timer: ReturnType<typeof setTimeout>; dirty: boolean }>();

export function scheduleStats(sessionId: string, activityId: string) {
  const pending = statsTimers.get(activityId);
  if (pending) {
    pending.dirty = true;
    return;
  }
  const fire = () => safeEmit(emitStats(sessionId, activityId));
  fire();
  const entry = {
    dirty: false,
    timer: setTimeout(function tick() {
      if (entry.dirty) {
        entry.dirty = false;
        fire();
        entry.timer = setTimeout(tick, STATS_INTERVAL_MS);
        entry.timer.unref?.();
      } else {
        statsTimers.delete(activityId);
      }
    }, STATS_INTERVAL_MS),
  };
  entry.timer.unref?.();
  statsTimers.set(activityId, entry);
}

async function emitStats(sessionId: string, activityId: string) {
  const server = io;
  if (!server) return;
  const a = await prisma.activity.findUnique({ where: { id: activityId }, select: { round: true } });
  if (!a) return;
  const round = a.round;
  const [responses, joined] = await Promise.all([countResponses(activityId, round), countJoined(sessionId)]);
  server
    .to([rooms.host(sessionId), rooms.present(sessionId)])
    .emit('activity:stats', { activityId, round, responses, joined });
}

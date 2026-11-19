import {
  generateJoinCode,
  SCHEDULE_MAX_AHEAD_MS,
  SESSION_MAX_LIVE_MS,
  TAKEAWAY_VISIBLE_MS,
  type CreatedSession,
  type SessionListItem,
  type UpdateScheduleInput,
} from '@getit/shared';
import type { Prisma, Session } from '@prisma/client';
import { prisma } from '../db';
import { bus } from '../lib/bus';
import { HttpError } from '../lib/errors';
import { isUniqueViolation } from './auth';
import { assertOwnsCourse } from './courses';

export const SESSION_GONE_MESSAGE = "That session doesn't exist or has expired.";
const NOT_FOUND = () => new HttpError(404, 'NOT_FOUND', SESSION_GONE_MESSAGE);

// ─── Create / list ──────────────────────────────────────────────────────────

/** A planned start must be in the future (a minute of slack for slow forms) and within a year. */
function plannedStart(iso: string, now = new Date()): Date {
  const at = new Date(iso);
  if (at.getTime() < now.getTime() - 60_000)
    throw new HttpError(400, 'VALIDATION', 'Choose a time in the future, or start the lecture now.');
  if (at.getTime() > now.getTime() + SCHEDULE_MAX_AHEAD_MS)
    throw new HttpError(400, 'VALIDATION', 'Lectures can be planned up to a year ahead.');
  return at;
}

export async function createSession(
  instructorId: string,
  input: {
    courseId?: string | null | undefined;
    topic: string;
    academicMode: boolean;
    scheduledFor?: string | null | undefined;
    durationMin?: number | undefined;
    autoStart?: boolean | undefined;
  },
  makeCode: () => string = generateJoinCode,
): Promise<CreatedSession> {
  if (input.courseId) await assertOwnsCourse(instructorId, input.courseId);
  // Calendar: a planned lecture is SCHEDULED; its code is reserved now so it can be shared in advance.
  const at = input.scheduledFor ? plannedStart(input.scheduledFor) : null;
  // The partial unique index (code WHERE not ENDED) is the real guard; retry on the rare collision.
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      const s = await prisma.session.create({
        data: {
          instructorId,
          courseId: input.courseId ?? null,
          topic: input.topic,
          academicMode: input.academicMode,
          ...(at
            ? { status: 'SCHEDULED', startedAt: at, scheduledFor: at, autoStart: input.autoStart ?? true }
            : {}),
          durationMin: input.durationMin ?? null,
          code: makeCode(),
          parts: { create: { number: 1 } }, // Part 1 is created with the session (schema comment)
        },
        select: { id: true, code: true },
      });
      return s;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw new HttpError(503, 'CODE_UNAVAILABLE', 'Could not create a join code. Please try again.');
}

export async function listSessions(
  instructorId: string,
  filter: { courseId?: string | null } = {},
): Promise<SessionListItem[]> {
  await endExpiredSessions({ instructorId });
  const where: Prisma.SessionWhereInput = { instructorId };
  if (filter.courseId !== undefined) where.courseId = filter.courseId;
  const rows = await prisma.session.findMany({
    where,
    orderBy: { startedAt: 'desc' },
    include: { _count: { select: { participants: true, questions: true, activities: true } } },
  });
  return rows.map((s) => ({
    id: s.id,
    code: s.code,
    topic: s.topic,
    status: s.status,
    courseId: s.courseId,
    startedAt: s.startedAt.toISOString(),
    endedAt: s.endedAt?.toISOString() ?? null,
    joined: s._count.participants,
    questions: s._count.questions,
    activities: s._count.activities,
    scheduledFor: s.scheduledFor?.toISOString() ?? null,
    durationMin: s.durationMin,
    autoStart: s.autoStart,
  }));
}

// ─── Lookup (always through ensureNotExpired) ───────────────────────────────

/** Instructor view: their own session with this code, LIVE first, else the most recent. */
export async function findHostSession(instructorId: string, code: string): Promise<Session | null> {
  const s = await prisma.session.findFirst({
    where: { code, instructorId },
    orderBy: [{ status: 'asc' }, { startedAt: 'desc' }], // enum order: LIVE < SCHEDULED < ENDED
  });
  return s ? ensureNotExpired(s) : null;
}

export async function getHostSession(instructorId: string, code: string): Promise<Session> {
  const s = await findHostSession(instructorId, code);
  if (!s) throw NOT_FOUND();
  return s;
}

/**
 * Student view. Codes are reused after a session ends, so: the LIVE session with this code,
 * else the newest ENDED one that ended less than 24 h ago (Take-away window). Otherwise null.
 */
export async function findPublicSession(code: string, now = new Date()): Promise<Session | null> {
  const live = await prisma.session.findFirst({ where: { code, status: 'LIVE' } });
  if (live) {
    const checked = await ensureNotExpired(live, now);
    if (checked.status === 'LIVE') return checked;
  }
  return prisma.session.findFirst({
    where: { code, status: 'ENDED', endedAt: { gte: new Date(now.getTime() - TAKEAWAY_VISIBLE_MS) } },
    orderBy: { endedAt: 'desc' },
  });
}

/** A phone that opens a planned lecture's code early: the next SCHEDULED one, for the waiting screen. */
export function findScheduledPublic(code: string): Promise<Session | null> {
  return prisma.session.findFirst({ where: { code, status: 'SCHEDULED' }, orderBy: { scheduledFor: 'asc' } });
}

export async function getPublicSession(code: string): Promise<Session> {
  const s = await findPublicSession(code);
  if (!s) throw NOT_FOUND();
  return s;
}

// ─── End + expiry ───────────────────────────────────────────────────────────

export function isExpired(s: Pick<Session, 'status' | 'startedAt'>, now = new Date()): boolean {
  return s.status === 'LIVE' && now.getTime() - s.startedAt.getTime() >= SESSION_MAX_LIVE_MS;
}

/** docs/02: on every access, a LIVE session older than 6 h is ended (same as End session). */
export async function ensureNotExpired(s: Session, now = new Date()): Promise<Session> {
  if (!isExpired(s, now)) return s;
  return (await endSession(s.id, now)) ?? (await prisma.session.findUniqueOrThrow({ where: { id: s.id } }));
}

/**
 * End a session: status ENDED, endedAt, close any LIVE activity, create the Take-away draft with the
 * top topics. Idempotent: returns null if it was already ended. Raises `session:ended` after commit.
 */
export async function endSession(sessionId: string, now = new Date()): Promise<Session | null> {
  const ended = await prisma.$transaction(async (tx) => {
    const { count } = await tx.session.updateMany({
      where: { id: sessionId, status: 'LIVE' },
      data: { status: 'ENDED', endedAt: now, liveActivityId: null, version: { increment: 1 } },
    });
    if (count === 0) return null;
    await tx.activity.updateMany({ where: { sessionId, status: 'LIVE' }, data: { status: 'CLOSED' } });
    const topTopics = await tx.topic.findMany({
      where: { sessionId },
      orderBy: [{ meTooCount: 'desc' }, { createdAt: 'asc' }],
      take: 5,
      select: { id: true },
    });
    await tx.takeaway.upsert({
      where: { sessionId },
      create: { sessionId, topTopicIds: topTopics.map((t) => t.id) },
      update: {},
    });
    return tx.session.findUniqueOrThrow({ where: { id: sessionId } });
  });
  if (ended) bus.emit('session:ended', { sessionId, endedAt: now });
  return ended;
}

export async function endHostSession(instructorId: string, code: string): Promise<Session> {
  const s = await getHostSession(instructorId, code);
  if (s.status === 'ENDED') return s;
  return (await endSession(s.id)) ?? prisma.session.findUniqueOrThrow({ where: { id: s.id } });
}

/** Background sweep (and on dashboard load): end every LIVE session past 6 h. Returns how many ended. */
export async function endExpiredSessions(scope: { instructorId?: string } = {}, now = new Date()) {
  const stale = await prisma.session.findMany({
    where: {
      ...scope,
      status: 'LIVE',
      startedAt: { lte: new Date(now.getTime() - SESSION_MAX_LIVE_MS) },
    },
    select: { id: true },
  });
  let ended = 0;
  for (const { id } of stale) if (await endSession(id, now)) ended++;
  return ended;
}

// ─── Calendar: scheduled lectures ───────────────────────────────────────────

/**
 * SCHEDULED → LIVE (its time came, or the instructor pressed Start now). The real start time replaces
 * the planned one (the 6-hour limit counts from here). Atomic and idempotent: false if it wasn't
 * SCHEDULED any more. Raises `session:started` after commit.
 */
export async function startScheduledSession(sessionId: string, now = new Date()): Promise<boolean> {
  const { count } = await prisma.session.updateMany({
    where: { id: sessionId, status: 'SCHEDULED' },
    data: { status: 'LIVE', startedAt: now, version: { increment: 1 } },
  });
  if (count) bus.emit('session:started', { sessionId });
  return count > 0;
}

/** "Start now" on a planned lecture. A LIVE one is returned as is; an ended one can't start again. */
export async function startHostSession(instructorId: string, code: string): Promise<Session> {
  const s = await getHostSession(instructorId, code);
  if (s.status === 'ENDED') throw new HttpError(409, 'SESSION_ENDED', 'This lecture has already ended.');
  if (s.status === 'SCHEDULED') await startScheduledSession(s.id);
  return prisma.session.findUniqueOrThrow({ where: { id: s.id } });
}

/** Background sweep: start every auto-start lecture whose time has come. Returns how many started. */
export async function startDueSessions(now = new Date()) {
  const due = await prisma.session.findMany({
    where: { status: 'SCHEDULED', autoStart: true, scheduledFor: { lte: now } },
    select: { id: true },
  });
  let started = 0;
  for (const { id } of due) if (await startScheduledSession(id, now)) started++;
  return started;
}

async function scheduledHostSession(instructorId: string, code: string) {
  const s = await getHostSession(instructorId, code);
  if (s.status !== 'SCHEDULED')
    throw new HttpError(
      409,
      'NOT_SCHEDULED',
      "Only a lecture that hasn't started can be changed or cancelled.",
    );
  return s;
}

/** Change a planned lecture: topic, course, time, length, auto-start. */
export async function updateSchedule(instructorId: string, code: string, input: UpdateScheduleInput) {
  const s = await scheduledHostSession(instructorId, code);
  if (input.courseId) await assertOwnsCourse(instructorId, input.courseId);
  const at = input.scheduledFor ? plannedStart(input.scheduledFor) : undefined;
  return prisma.session.update({
    where: { id: s.id },
    data: {
      ...(input.topic !== undefined ? { topic: input.topic } : {}),
      ...(input.courseId !== undefined ? { courseId: input.courseId } : {}),
      ...(at ? { scheduledFor: at, startedAt: at } : {}),
      ...(input.durationMin !== undefined ? { durationMin: input.durationMin } : {}),
      ...(input.autoStart !== undefined ? { autoStart: input.autoStart } : {}),
      version: { increment: 1 },
    },
  });
}

/** Cancel a planned lecture (and its prepared activities). Only before it starts. */
export async function cancelScheduled(instructorId: string, code: string) {
  const s = await scheduledHostSession(instructorId, code);
  await prisma.session.delete({ where: { id: s.id } });
  return s;
}

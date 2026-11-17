import { summarizeRound, type QuickCheckDraft, type RoundStats } from '@getit/shared';
import { Prisma, type Activity } from '@prisma/client';
import { prisma } from '../db';
import { HttpError } from '../lib/errors';
import { asAnswer, type ActivityResults } from '../realtime/dto';
import { bumpVersion } from './version';

export const ONE_LIVE_MESSAGE = 'One activity can be live at a time.';
const notFound = () => new HttpError(404, 'NOT_FOUND', 'Activity not found.');

// ─── Stats ──────────────────────────────────────────────────────────────────

/** Per-round stats for one activity (rounds 1 … current). Quick Check only. */
export async function statsFor(a: Activity, db: Prisma.TransactionClient = prisma): Promise<RoundStats[]> {
  const correct = asAnswer(a.correct);
  if (a.type !== 'QUICK_CHECK' || correct === null) return [];
  const rows = await db.response.findMany({
    where: { activityId: a.id },
    select: { round: true, answer: true, confident: true },
  });
  const options = Array.isArray(a.options) ? (a.options as string[]) : [];
  const out: RoundStats[] = [];
  for (let round = 1; round <= a.round; round++) {
    const rs = rows
      .filter((r) => r.round === round)
      .flatMap((r) => {
        const ans = asAnswer(r.answer);
        return ans === null ? [] : [{ answer: ans, confident: r.confident }];
      });
    out.push(summarizeRound({ kind: a.kind, options, correct, tolerance: a.tolerance }, rs, round));
  }
  return out;
}

/** Stats (Quick Check) + count + Explain answers (texts only after closing; blocked ones have none). */
export async function activityResults(a: Activity): Promise<ActivityResults> {
  if (a.type === 'QUICK_CHECK') {
    const stats = await statsFor(a);
    return { stats, responseCount: stats[stats.length - 1]?.count ?? 0, explainAnswers: [] };
  }
  const rows = await prisma.response.findMany({
    where: { activityId: a.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, text: true, tag: true },
  });
  const open = a.status === 'LIVE' || a.status === 'DRAFT';
  return {
    stats: [],
    responseCount: rows.length,
    explainAnswers: open ? [] : rows.flatMap((r) => (r.text ? [{ id: r.id, text: r.text, tag: r.tag }] : [])),
  };
}

// ─── Create / edit / delete / order ─────────────────────────────────────────

function draftData(d: QuickCheckDraft) {
  return {
    type: 'QUICK_CHECK' as const,
    kind: d.kind,
    prompt: d.prompt,
    options: d.kind === 'MCQ' ? d.options : [],
    correct: d.correct,
    tolerance: d.kind === 'NUMERIC' ? d.tolerance : null,
    explanation: d.explanation,
  };
}

async function nextPosition(tx: Prisma.TransactionClient, sessionId: string) {
  const last = await tx.activity.findFirst({ where: { sessionId }, orderBy: { position: 'desc' } });
  return (last?.position ?? 0) + 1;
}

export async function createExplain(sessionId: string, draft: { prompt: string; modelAnswer: string }) {
  return prisma.$transaction(async (tx) => {
    const a = await tx.activity.create({
      data: {
        sessionId,
        type: 'EXPLAIN',
        prompt: draft.prompt,
        modelAnswer: draft.modelAnswer || null,
        position: await nextPosition(tx, sessionId),
      },
    });
    return { activity: a, version: await bumpVersion(tx, sessionId) };
  });
}

export async function createQuickCheck(sessionId: string, draft: QuickCheckDraft) {
  return prisma.$transaction(async (tx) => {
    const a = await tx.activity.create({
      data: { sessionId, ...draftData(draft), position: await nextPosition(tx, sessionId) },
    });
    return { activity: a, version: await bumpVersion(tx, sessionId) };
  });
}

/** DRAFT: anything. LIVE: nothing. CLOSED/REVEALED: wording only (results must stay fair). */
export async function editActivity(
  a: Activity,
  change:
    | { full: QuickCheckDraft }
    | { text: { prompt: string; explanation: string; options?: string[] | undefined } }
    | { explain: { prompt: string; modelAnswer: string } },
) {
  if (a.status === 'LIVE') throw new HttpError(409, 'ACTIVITY_LIVE', 'Close the activity before editing it.');
  return prisma.$transaction(async (tx) => {
    let data: Prisma.ActivityUpdateInput;
    if ('explain' in change) {
      data = { prompt: change.explain.prompt, modelAnswer: change.explain.modelAnswer || null };
    } else if ('full' in change) {
      if (a.status !== 'DRAFT') {
        throw new HttpError(409, 'ALREADY_RUN', 'After launching you can only fix the wording.');
      }
      data = draftData(change.full);
    } else {
      const current = Array.isArray(a.options) ? (a.options as string[]) : [];
      const options = change.text.options ?? current;
      if (options.length !== current.length) {
        throw new HttpError(409, 'ALREADY_RUN', 'After launching you can only fix the wording.');
      }
      data = { prompt: change.text.prompt, explanation: change.text.explanation, options };
    }
    const updated = await tx.activity.update({ where: { id: a.id }, data });
    return { activity: updated, version: await bumpVersion(tx, a.sessionId) };
  });
}

export async function deleteActivity(a: Activity) {
  if (a.status === 'LIVE')
    throw new HttpError(409, 'ACTIVITY_LIVE', 'Close the activity before deleting it.');
  return prisma.$transaction(async (tx) => {
    await tx.session.updateMany({
      where: { id: a.sessionId, presentActivityId: a.id },
      data: { presentActivityId: null },
    });
    await tx.activity.delete({ where: { id: a.id } });
    return { version: await bumpVersion(tx, a.sessionId) };
  });
}

/** `ids` must be exactly this session's activities, in the new run order. */
export async function reorderActivities(sessionId: string, ids: string[]) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.activity.findMany({ where: { sessionId }, select: { id: true } });
    const set = new Set(existing.map((e) => e.id));
    if (ids.length !== set.size || new Set(ids).size !== ids.length || ids.some((id) => !set.has(id))) {
      throw new HttpError(400, 'VALIDATION', 'The list changed. Refresh and try again.');
    }
    await Promise.all(ids.map((id, i) => tx.activity.update({ where: { id }, data: { position: i + 1 } })));
    return { version: await bumpVersion(tx, sessionId) };
  });
}

/** Copy an earlier session's activities (e.g. the seeded templates) as fresh drafts at the end. */
export async function copyActivities(instructorId: string, sessionId: string, fromSessionId: string) {
  const from = await prisma.session.findUnique({
    where: { id: fromSessionId },
    select: { instructorId: true },
  });
  if (!from || from.instructorId !== instructorId)
    throw new HttpError(404, 'NOT_FOUND', 'Session not found.');
  return prisma.$transaction(async (tx) => {
    const source = await tx.activity.findMany({
      where: { sessionId: fromSessionId },
      orderBy: { position: 'asc' },
    });
    let position = await nextPosition(tx, sessionId);
    for (const a of source) {
      await tx.activity.create({
        data: {
          sessionId,
          type: a.type,
          kind: a.kind,
          prompt: a.prompt,
          options: a.options ?? [],
          correct: a.correct ?? undefined,
          tolerance: a.tolerance,
          explanation: a.explanation,
          modelAnswer: a.modelAnswer,
          position: position++,
        },
      });
    }
    return { copied: source.length, version: await bumpVersion(tx, sessionId) };
  });
}

// ─── Lifecycle: DRAFT → LIVE → CLOSED → REVEALED (+ new round, undo) ────────

export type LifecycleResult = {
  activity: Activity;
  version: number;
  liveActivityId: string | null;
  stageActivityId: string | null;
};

async function finish(tx: Prisma.TransactionClient, activity: Activity): Promise<LifecycleResult> {
  const s = await tx.session.update({
    where: { id: activity.sessionId },
    data: { version: { increment: 1 } },
    select: { version: true, liveActivityId: true, presentActivityId: true },
  });
  return {
    activity,
    version: s.version,
    liveActivityId: s.liveActivityId,
    stageActivityId: s.presentActivityId,
  };
}

async function load(tx: Prisma.TransactionClient, sessionId: string, activityId: string) {
  const a = await tx.activity.findUnique({ where: { id: activityId } });
  if (!a || a.sessionId !== sessionId) throw notFound();
  return a;
}

async function requireLiveSession(tx: Prisma.TransactionClient, sessionId: string) {
  const s = await tx.session.findUniqueOrThrow({ where: { id: sessionId }, select: { status: true } });
  if (s.status !== 'LIVE') throw new HttpError(409, 'SESSION_ENDED', 'The session has ended.');
}

/** Claim the session's single live slot; fails if another activity holds it (rule 4). */
async function claimLiveSlot(tx: Prisma.TransactionClient, sessionId: string, activityId: string) {
  const { count } = await tx.session.updateMany({
    where: { id: sessionId, liveActivityId: null },
    // The new question takes the projector (replaces a projected topic / blank screen).
    data: { liveActivityId: activityId, presentActivityId: activityId, projected: Prisma.DbNull },
  });
  if (count === 0) throw new HttpError(409, 'ONE_LIVE', ONE_LIVE_MESSAGE);
}

function isUniqueViolation(err: unknown) {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';
}

/** Run a lifecycle transaction; a unique-index race on the one-live rule becomes the friendly error. */
async function lifecycle(fn: (tx: Prisma.TransactionClient) => Promise<LifecycleResult>) {
  try {
    return await prisma.$transaction(fn);
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, 'ONE_LIVE', ONE_LIVE_MESSAGE);
    throw err;
  }
}

export function launchActivity(sessionId: string, activityId: string, timerSec = 0) {
  return lifecycle(async (tx) => {
    await requireLiveSession(tx, sessionId);
    const a = await load(tx, sessionId, activityId);
    if (a.status !== 'DRAFT') throw new HttpError(409, 'NOT_DRAFT', 'This activity has already been run.');
    await claimLiveSlot(tx, sessionId, a.id);
    return finish(
      tx,
      await tx.activity.update({
        where: { id: a.id },
        data: { status: 'LIVE', closesAt: closesAtFrom(timerSec) },
      }),
    );
  });
}

const closesAtFrom = (timerSec: number) => (timerSec > 0 ? new Date(Date.now() + timerSec * 1000) : null);

export function closeActivity(sessionId: string, activityId: string, reveal = false) {
  return lifecycle(async (tx) => {
    const a = await load(tx, sessionId, activityId);
    if (a.status !== 'LIVE') throw new HttpError(409, 'NOT_LIVE', 'This activity is not live.');
    await tx.session.updateMany({
      where: { id: sessionId, liveActivityId: a.id },
      data: { liveActivityId: null },
    });
    const status = reveal && a.type === 'QUICK_CHECK' ? 'REVEALED' : 'CLOSED';
    return finish(tx, await tx.activity.update({ where: { id: a.id }, data: { status, closesAt: null } }));
  });
}

/** Show the answer. From LIVE it closes first. */
export function revealActivity(sessionId: string, activityId: string) {
  return lifecycle(async (tx) => {
    const a = await load(tx, sessionId, activityId);
    if (a.type !== 'QUICK_CHECK')
      throw new HttpError(409, 'NOT_QUICK_CHECK', 'Only Quick Checks have an answer.');
    if (a.status === 'DRAFT') throw new HttpError(409, 'NOT_RUN', 'Launch the activity first.');
    if (a.status === 'REVEALED') return finish(tx, a);
    if (a.status === 'LIVE') {
      await tx.session.updateMany({
        where: { id: sessionId, liveActivityId: a.id },
        data: { liveActivityId: null },
      });
    }
    await tx.session.update({ where: { id: sessionId }, data: { presentActivityId: a.id } });
    return finish(
      tx,
      await tx.activity.update({ where: { id: a.id }, data: { status: 'REVEALED', closesAt: null } }),
    );
  });
}

/** Vote again (peer instruction): same question, round + 1, LIVE. Only before the answer is shown. */
export function newRound(sessionId: string, activityId: string, timerSec = 0) {
  return lifecycle(async (tx) => {
    await requireLiveSession(tx, sessionId);
    const a = await load(tx, sessionId, activityId);
    if (a.type !== 'QUICK_CHECK')
      throw new HttpError(409, 'NOT_QUICK_CHECK', 'Only Quick Checks can be voted again.');
    if (a.status !== 'CLOSED') {
      throw new HttpError(
        409,
        'NOT_CLOSED',
        a.status === 'REVEALED' ? 'The answer is already shown.' : 'Close the round first.',
      );
    }
    await claimLiveSlot(tx, sessionId, a.id);
    return finish(
      tx,
      await tx.activity.update({
        where: { id: a.id },
        data: { status: 'LIVE', round: { increment: 1 }, closesAt: closesAtFrom(timerSec) },
      }),
    );
  });
}

/**
 * Projector ←: step back one step. REVEALED → CLOSED → LIVE (same round; answers continue).
 * A LIVE question nobody has answered yet can also be taken back (a mis-pressed clicker):
 * round 1 → DRAFT (stage goes back to the previous activity), round n > 1 → CLOSED round n − 1.
 */
export function undoActivity(sessionId: string, activityId: string) {
  return lifecycle(async (tx) => {
    const a = await load(tx, sessionId, activityId);
    if (a.status === 'REVEALED') {
      return finish(tx, await tx.activity.update({ where: { id: a.id }, data: { status: 'CLOSED' } }));
    }
    if (a.status === 'CLOSED') {
      await requireLiveSession(tx, sessionId);
      await claimLiveSlot(tx, sessionId, a.id);
      return finish(tx, await tx.activity.update({ where: { id: a.id }, data: { status: 'LIVE' } }));
    }
    if (a.status === 'LIVE') {
      const answered = await tx.response.count({ where: { activityId: a.id, round: a.round } });
      if (answered > 0) {
        throw new HttpError(
          409,
          'HAS_ANSWERS',
          'Students have already answered. Close the question instead.',
        );
      }
      await tx.session.updateMany({
        where: { id: sessionId, liveActivityId: a.id },
        data: { liveActivityId: null },
      });
      if (a.round > 1) {
        return finish(
          tx,
          await tx.activity.update({
            where: { id: a.id },
            data: { status: 'CLOSED', round: { decrement: 1 }, closesAt: null },
          }),
        );
      }
      const previous = await tx.activity.findFirst({
        where: { sessionId, position: { lt: a.position }, status: { not: 'DRAFT' } },
        orderBy: { position: 'desc' },
      });
      await tx.session.update({
        where: { id: sessionId },
        data: { presentActivityId: previous?.id ?? null },
      });
      return finish(
        tx,
        await tx.activity.update({ where: { id: a.id }, data: { status: 'DRAFT', closesAt: null } }),
      );
    }
    throw new HttpError(409, 'NOTHING_TO_UNDO', 'Nothing to undo.');
  });
}

/** Projector timer chip: +15 s on a running timer. */
export function addTime(sessionId: string, activityId: string, seconds: number) {
  return lifecycle(async (tx) => {
    const a = await load(tx, sessionId, activityId);
    if (a.status !== 'LIVE' || !a.closesAt)
      throw new HttpError(409, 'NO_TIMER', 'This question has no running timer.');
    const base = Math.max(a.closesAt.getTime(), Date.now());
    return finish(
      tx,
      await tx.activity.update({ where: { id: a.id }, data: { closesAt: new Date(base + seconds * 1000) } }),
    );
  });
}

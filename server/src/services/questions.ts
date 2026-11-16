import { LIMITS, moderateQuestion, type FlagCounts, type HostQuestion } from '@getit/shared';
import { prisma } from '../db';
import { HttpError } from '../lib/errors';
import { toHostQuestion } from '../realtime/dto';
import { assertSameSessionPart } from './topics';
import { bumpVersion } from './version';

export type AskOutcome =
  | { kind: 'stored'; version: number; question: HostQuestion }
  | ({ kind: 'blocked'; version: number } & FlagCounts)
  | { kind: 'limited' };

/**
 * Student asks a question (docs/02 "Submit question", rules 5 + 6). One transaction:
 * lock the participant row → 5 s gap + 40 limit → moderate → insert, or bump flaggedCount.
 * Blocked text is never stored. The caller acks every outcome identically.
 */
export async function askQuestion(
  sessionId: string,
  deviceHash: string,
  rawText: string,
  now = new Date(),
): Promise<AskOutcome> {
  // Empty / too long is a plain validation error (the phone checks this too) — not a stealth case.
  const mod = moderateQuestion(rawText);
  if (!mod.ok && mod.reason !== 'blocked') {
    throw new HttpError(
      400,
      'VALIDATION',
      mod.reason === 'empty'
        ? 'Write a question first.'
        : `Questions can be up to ${LIMITS.questionMax} characters.`,
    );
  }

  return prisma.$transaction(async (tx) => {
    const session = await tx.session.findUnique({
      where: { id: sessionId },
      select: { status: true, academicMode: true },
    });
    if (!session) throw new HttpError(404, 'NOT_FOUND', "That session doesn't exist or has expired.");
    if (session.status !== 'LIVE') throw new HttpError(409, 'SESSION_ENDED', 'The lecture has ended.');

    await tx.participant.upsert({
      where: { sessionId_deviceHash: { sessionId, deviceHash } },
      create: { sessionId, deviceHash },
      update: {},
    });
    // Serialise this device's questions: two fast taps can't both pass the 5 s check.
    const [p] = await tx.$queryRaw<{ questionCount: number; lastQuestionAt: Date | null }[]>`
      SELECT "questionCount", "lastQuestionAt" FROM "Participant"
      WHERE "sessionId" = ${sessionId} AND "deviceHash" = ${deviceHash} FOR UPDATE`;
    if (!p) throw new Error('participant row missing after upsert');
    const tooSoon = p.lastQuestionAt && now.getTime() - p.lastQuestionAt.getTime() < LIMITS.questionMinGapMs;
    if (tooSoon || p.questionCount >= LIMITS.questionsPerDevice) return { kind: 'limited' } as const;

    // Every accepted attempt (stored or blocked) counts toward the limits, so spam can't loop.
    await tx.participant.update({
      where: { sessionId_deviceHash: { sessionId, deviceHash } },
      data: { lastQuestionAt: now, questionCount: { increment: 1 } },
    });

    const part = await tx.part.findFirstOrThrow({ where: { sessionId }, orderBy: { number: 'desc' } });
    // Academic mode ON = moderation (spec B). OFF = informal session: only cleaning + length.
    const blocked = session.academicMode && !mod.ok;
    if (blocked) {
      const s = await tx.session.update({
        where: { id: sessionId },
        data: { flaggedCount: { increment: 1 }, version: { increment: 1 } },
        select: { flaggedCount: true, version: true },
      });
      const pt = await tx.part.update({ where: { id: part.id }, data: { flaggedCount: { increment: 1 } } });
      return {
        kind: 'blocked',
        version: s.version,
        flaggedCount: s.flaggedCount,
        part: { id: pt.id, flaggedCount: pt.flaggedCount },
      } as const;
    }

    const text = mod.ok ? mod.text : rawText.normalize('NFC').replace(/\s+/gu, ' ').trim();
    const q = await tx.question.create({
      data: { sessionId, partId: part.id, text, deviceHash, createdAt: now },
    });
    return {
      kind: 'stored',
      version: await bumpVersion(tx, sessionId),
      question: toHostQuestion(q),
    } as const;
  });
}

/** Instructor: tick "Addressed" and/or move a question into a topic (or out: topicId null). */
export async function updateQuestion(
  sessionId: string,
  questionId: string,
  partId: string,
  patch: { addressed?: boolean | undefined; topicId?: string | null | undefined },
): Promise<{ version: number; question: HostQuestion }> {
  return prisma.$transaction(async (tx) => {
    if (patch.topicId) await assertSameSessionPart(tx, sessionId, patch.topicId, [partId]);
    const q = await tx.question.update({
      where: { id: questionId },
      data: {
        ...(patch.addressed !== undefined ? { addressed: patch.addressed } : {}),
        ...(patch.topicId !== undefined ? { topicId: patch.topicId } : {}),
      },
    });
    return { version: await bumpVersion(tx, sessionId), question: toHostQuestion(q) };
  });
}

/** Instructor "Remove" (inappropriate): delete it and count it as flagged (spec C1). */
export async function removeQuestion(
  sessionId: string,
  questionId: string,
  partId: string,
): Promise<{ version: number } & FlagCounts> {
  return prisma.$transaction(async (tx) => {
    await tx.question.delete({ where: { id: questionId } });
    const s = await tx.session.update({
      where: { id: sessionId },
      data: { flaggedCount: { increment: 1 }, version: { increment: 1 } },
      select: { flaggedCount: true, version: true },
    });
    const p = await tx.part.update({ where: { id: partId }, data: { flaggedCount: { increment: 1 } } });
    return {
      version: s.version,
      flaggedCount: s.flaggedCount,
      part: { id: p.id, flaggedCount: p.flaggedCount },
    };
  });
}

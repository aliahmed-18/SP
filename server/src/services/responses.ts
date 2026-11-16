import type { Answer, MyResponse } from '@getit/shared';
import type { Activity, Response } from '@prisma/client';
import { prisma } from '../db';
import { HttpError } from '../lib/errors';
import { asAnswer } from '../realtime/dto';

const toMine = (r: Response): MyResponse => ({
  round: r.round,
  answer: asAnswer(r.answer)!,
  confident: r.confident,
});

function assertValidAnswer(a: Activity, answer: Answer) {
  const options = Array.isArray(a.options) ? a.options.length : 0;
  const ok =
    (a.kind === 'MCQ' &&
      typeof answer === 'number' &&
      Number.isInteger(answer) &&
      answer >= 0 &&
      answer < options) ||
    (a.kind === 'TRUE_FALSE' && typeof answer === 'boolean') ||
    (a.kind === 'NUMERIC' && typeof answer === 'number' && Number.isFinite(answer));
  if (!ok) throw new HttpError(400, 'VALIDATION', 'Invalid answer.');
}

/**
 * Rule 4: one answer per device per round. The unique (activityId, deviceHash, round) constraint is the
 * real guard; a duplicate returns the FIRST stored answer (docs/02), never an error.
 */
export async function submitAnswer(
  sessionId: string,
  deviceHash: string,
  input: { activityId: string; round: number; answer: Answer },
): Promise<{ mine: MyResponse; created: boolean }> {
  const a = await prisma.activity.findUnique({ where: { id: input.activityId } });
  if (!a || a.sessionId !== sessionId || a.type !== 'QUICK_CHECK') {
    throw new HttpError(404, 'NOT_FOUND', 'Activity not found.');
  }
  const key = { activityId_deviceHash_round: { activityId: a.id, deviceHash, round: input.round } };
  const existing = await prisma.response.findUnique({ where: key });
  if (existing) return { mine: toMine(existing), created: false };
  if (a.status !== 'LIVE' || a.round !== input.round) {
    throw new HttpError(409, 'ANSWERING_CLOSED', 'Answering is closed for this question.');
  }
  assertValidAnswer(a, input.answer);
  await prisma.participant.createMany({ data: [{ sessionId, deviceHash }], skipDuplicates: true });
  const { count } = await prisma.response.createMany({
    data: [{ activityId: a.id, deviceHash, round: input.round, answer: input.answer }],
    skipDuplicates: true,
  });
  const row = await prisma.response.findUniqueOrThrow({ where: key });
  return { mine: toMine(row), created: count > 0 };
}

/** "How sure are you?" — this device's own answer, before the answer is revealed. */
export async function setConfidence(
  sessionId: string,
  deviceHash: string,
  input: { activityId: string; round: number; confident: boolean | null },
): Promise<MyResponse> {
  const a = await prisma.activity.findUnique({ where: { id: input.activityId } });
  if (!a || a.sessionId !== sessionId) throw new HttpError(404, 'NOT_FOUND', 'Activity not found.');
  if (a.status === 'REVEALED' || a.round !== input.round) {
    throw new HttpError(409, 'ANSWER_SHOWN', 'The answer has already been shown.');
  }
  const key = { activityId_deviceHash_round: { activityId: a.id, deviceHash, round: input.round } };
  const existing = await prisma.response.findUnique({ where: key });
  if (!existing) throw new HttpError(409, 'NO_ANSWER', 'Answer the question first.');
  return toMine(await prisma.response.update({ where: key, data: { confident: input.confident } }));
}

export async function myResponse(activity: Activity | null, deviceHash: string): Promise<MyResponse | null> {
  if (!activity || activity.type !== 'QUICK_CHECK') return null;
  const r = await prisma.response.findUnique({
    where: { activityId_deviceHash_round: { activityId: activity.id, deviceHash, round: activity.round } },
  });
  return r ? toMine(r) : null;
}

export function countResponses(activityId: string, round: number) {
  return prisma.response.count({ where: { activityId, round } });
}

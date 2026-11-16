import {
  DEFAULT_PRESENT_SETTINGS,
  presentSettingsSchema,
  projectSchema,
  type PresentSettings,
  type ProjectedItem,
  type ProjectedView,
} from '@getit/shared';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { HttpError } from '../lib/errors';
import { bumpVersion } from './version';

/** Stored settings, falling back to defaults (old rows / bad JSON never break the projector). */
export function readSettings(json: Prisma.JsonValue | null): PresentSettings {
  const parsed = presentSettingsSchema.safeParse(json);
  return parsed.success ? parsed.data : DEFAULT_PRESENT_SETTINGS;
}

export function readProjected(json: Prisma.JsonValue | null): ProjectedItem | null {
  const parsed = projectSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

export async function saveSettings(sessionId: string, settings: PresentSettings) {
  return prisma.$transaction(async (tx) => {
    await tx.session.update({ where: { id: sessionId }, data: { presentSettings: settings } });
    return { version: await bumpVersion(tx, sessionId) };
  });
}

/** Show something on the projector instead of the activity; a topic must belong to this session. */
export async function setProjected(sessionId: string, item: ProjectedItem | null) {
  if (item?.kind === 'topic') {
    const t = await prisma.topic.findUnique({ where: { id: item.id }, select: { sessionId: true } });
    if (!t || t.sessionId !== sessionId) throw new HttpError(404, 'NOT_FOUND', 'Topic not found.');
  }
  return prisma.$transaction(async (tx) => {
    await tx.session.update({
      where: { id: sessionId },
      data: { projected: item === null ? Prisma.DbNull : item },
    });
    return { version: await bumpVersion(tx, sessionId) };
  });
}

/** Resolve the stored item into what the projector draws. A deleted topic resolves to null. */
export async function buildProjectedView(json: Prisma.JsonValue | null): Promise<ProjectedView | null> {
  const item = readProjected(json);
  if (!item) return null;
  if (item.kind !== 'topic') return item;
  const t = await prisma.topic.findUnique({
    where: { id: item.id },
    include: { questions: { orderBy: { createdAt: 'asc' }, select: { text: true } } },
  });
  if (!t) return null;
  return {
    kind: 'topic',
    id: t.id,
    topic: {
      id: t.id,
      title: t.title,
      status: t.status,
      reply: t.reply,
      meTooCount: t.meTooCount,
      questions: t.questions.map((q) => q.text),
    },
  };
}

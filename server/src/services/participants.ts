import { prisma } from '../db';
import { bus } from '../lib/bus';

export function countJoined(sessionId: string): Promise<number> {
  return prisma.participant.count({ where: { sessionId } });
}

/**
 * Register a device in a LIVE session (idempotent: one row per device). Raises `session:joined`
 * only when a new device arrives, so refreshes don't spam the host.
 */
export async function joinSession(sessionId: string, deviceHash: string): Promise<{ created: boolean }> {
  const { count } = await prisma.participant.createMany({
    data: [{ sessionId, deviceHash }],
    skipDuplicates: true,
  });
  if (count > 0) bus.emit('session:joined', { sessionId, joinedCount: await countJoined(sessionId) });
  return { created: count > 0 };
}

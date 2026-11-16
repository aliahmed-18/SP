import type { Prisma } from '@prisma/client';

/** Bump session.version inside the caller's transaction and return the new value (docs/04 gap detection). */
export async function bumpVersion(tx: Prisma.TransactionClient, sessionId: string): Promise<number> {
  const s = await tx.session.update({
    where: { id: sessionId },
    data: { version: { increment: 1 } },
    select: { version: true },
  });
  return s.version;
}

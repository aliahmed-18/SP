import { EventEmitter } from 'node:events';

/**
 * Domain events raised by services after their transaction commits. The realtime layer subscribes
 * and emits socket events, so services never import Socket.io (CLAUDE.md §5) and no write is forgotten (rule 8).
 */
export type DomainEvents = {
  'session:ended': [{ sessionId: string; endedAt: Date }];
  /** A SCHEDULED lecture went LIVE (its time came, or the instructor pressed Start now). */
  'session:started': [{ sessionId: string }];
  'session:joined': [{ sessionId: string; joinedCount: number }];
};

class Bus extends EventEmitter<DomainEvents> {}
export const bus = new Bus();

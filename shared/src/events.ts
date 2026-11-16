// Socket.io contract (docs/04-realtime-events.md). Grows phase by phase.
// Every client → server event takes an ack callback with `Ack<T>`.
import type { HostState, PresentState, StudentState } from './types';
import type { SocketRole } from './schemas';

export type AckError = { code: string; message: string };
export type Ack<T = undefined> = { ok: true; data: T } | { ok: false; error: AckError };

export type PingResult = { serverTime: string };

/** Error codes the server puts in `connect_error.message` when it refuses a handshake. */
export const SOCKET_REFUSAL = {
  invalid: 'INVALID_AUTH', // malformed handshake
  notFound: 'SESSION_NOT_FOUND', // no such session / expired
  forbidden: 'FORBIDDEN', // token missing, expired or not the owner
} as const;
export type SocketRefusal = (typeof SOCKET_REFUSAL)[keyof typeof SOCKET_REFUSAL];

export interface ClientToServerEvents {
  'system:ping': (ack: (res: Ack<PingResult>) => void) => void;
  /** Ask for a fresh snapshot (tab visible again / back online / version gap). */
  'state:request': (ack?: (res: Ack) => void) => void;
}

export interface ServerToClientEvents {
  'state:student': (state: StudentState) => void;
  'state:host': (state: HostState) => void;
  'state:present': (state: PresentState) => void;
  'session:joined': (payload: { joinedCount: number }) => void;
  'session:ended': (payload: { endedAt: string }) => void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface InterServerEvents {}

export interface SocketData {
  role: SocketRole;
  sessionId: string;
  /** Only for students; never sent to any client. */
  deviceHash?: string;
  instructorId?: string;
}

export const rooms = {
  students: (sessionId: string) => `s:${sessionId}:students`,
  host: (sessionId: string) => `s:${sessionId}:host`,
  present: (sessionId: string) => `s:${sessionId}:present`,
} as const;

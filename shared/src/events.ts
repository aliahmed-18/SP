// Socket.io contract (docs/04-realtime-events.md). Phase 1: only the system ping.
// Every client → server event takes an ack callback with `Ack<T>`.

export type AckError = { code: string; message: string };
export type Ack<T = undefined> = { ok: true; data: T } | { ok: false; error: AckError };

export type PingResult = { serverTime: string };

export interface ClientToServerEvents {
  'system:ping': (ack: (res: Ack<PingResult>) => void) => void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ServerToClientEvents {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface InterServerEvents {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SocketData {}

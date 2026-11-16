// Socket.io contract (docs/04-realtime-events.md). Grows phase by phase.
// Every client → server event takes an ack callback with `Ack<T>`.
import type {
  ActivityStats,
  HostActivity,
  HostQuestion,
  HostState,
  HostTopic,
  MyResponse,
  PresentActivity,
  PresentState,
  PublicTopic,
  StudentActivity,
  ProjectedView,
  StudentState,
} from './types';
import type { PresentSettings, ProjectedItem } from './schemas';
import type { Answer } from './rules';
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
  /** Student. Ack is identical whether the question was stored, blocked or rate-limited (rules 5, 6). */
  'question:ask': (payload: { text: string }, ack: (res: Ack<{ sentAt: string }>) => void) => void;
  /** Student. One Me too per device per topic; `on: false` undoes it. */
  'topic:metoo': (
    payload: { topicId: string; on: boolean },
    ack: (res: Ack<{ on: boolean; meTooCount: number }>) => void,
  ) => void;
  /** Student. Duplicate in the same round → ack with the FIRST answer (not an error). */
  'activity:answer': (
    payload: { activityId: string; round: number; answer: Answer },
    ack: (res: Ack<MyResponse>) => void,
  ) => void;
  /** Student. "How sure are you?" Sure / Not sure / Skip (null). */
  'activity:confidence': (
    payload: { activityId: string; round: number; confident: boolean | null },
    ack: (res: Ack<MyResponse>) => void,
  ) => void;
  // Host / projector lifecycle (one LIVE activity per session).
  'activity:launch': (payload: { activityId: string; timerSec?: number }, ack: (res: Ack) => void) => void;
  'activity:close': (payload: { activityId: string; reveal?: boolean }, ack: (res: Ack) => void) => void;
  'activity:reveal': (payload: { activityId: string }, ack: (res: Ack) => void) => void;
  'activity:newRound': (payload: { activityId: string; timerSec?: number }, ack: (res: Ack) => void) => void;
  /** Projector timer chip: +15 s. */
  'activity:addTime': (payload: { activityId: string }, ack: (res: Ack) => void) => void;
  /** Host / projector: what the projector shows instead of the activity (null = back to it). */
  'present:project': (payload: { item: ProjectedItem | null }, ack: (res: Ack) => void) => void;
  /** Projector settings (timer, auto-reveal), stored on the session. */
  'present:settings': (payload: PresentSettings, ack: (res: Ack) => void) => void;
  'activity:undo': (payload: { activityId: string }, ack: (res: Ack) => void) => void;
}

/** Part counters that change when something is flagged. */
export type FlagCounts = { flaggedCount: number; part: { id: string; flaggedCount: number } };

export interface ServerToClientEvents {
  'state:student': (state: StudentState) => void;
  'state:host': (state: HostState) => void;
  'state:present': (state: PresentState) => void;
  'session:joined': (payload: { joinedCount: number }) => void;
  'session:ended': (payload: { endedAt: string }) => void;
  // Host incremental events carry `version`; a gap (> local + 1) means "ask for a snapshot".
  'question:new': (payload: { version: number; question: HostQuestion }) => void;
  'question:updated': (payload: { version: number; question: HostQuestion }) => void;
  'question:removed': (payload: { version: number; questionId: string } & FlagCounts) => void;
  'qa:flagged': (payload: { version: number } & FlagCounts) => void;
  'topics:host': (payload: { version: number; topics: HostTopic[] }) => void;
  /** Students: the class's topic list (their own `iMeToo` is kept client-side from snapshot + acks). */
  'topics:updated': (payload: { topics: PublicTopic[] }) => void;
  /** Host: one activity changed (status, round, stats). */
  'activity:host': (payload: {
    version: number;
    activity: HostActivity;
    liveActivityId: string | null;
    stageActivityId: string | null;
  }) => void;
  /** Projector (and host): the projected item changed. */
  'present:projected': (payload: { projected: ProjectedView | null }) => void;
  /** Projector: same, projector DTO. */
  'activity:present': (payload: {
    activity: PresentActivity;
    liveActivityId: string | null;
    stageActivityId: string | null;
    serverTime: string;
  }) => void;
  /** Students: the activity on stage (student DTO — no answer before REVEALED), or null. */
  'activity:student': (payload: { activity: StudentActivity | null }) => void;
  /** Live answer count (throttled to ≤ 4/s per activity). */
  'activity:stats': (payload: ActivityStats) => void;
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

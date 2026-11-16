// Shared names (CLAUDE.md §5) and DTO shapes (docs/04-realtime-events.md).
// Kept as plain string unions so client code never imports Prisma.

export const SESSION_STATUS = ['LIVE', 'ENDED'] as const;
export type SessionStatus = (typeof SESSION_STATUS)[number];

export const ACTIVITY_TYPE = ['QUICK_CHECK', 'EXPLAIN'] as const;
export type ActivityType = (typeof ACTIVITY_TYPE)[number];

export const QUICK_CHECK_KIND = ['MCQ', 'TRUE_FALSE', 'NUMERIC'] as const;
export type QuickCheckKind = (typeof QUICK_CHECK_KIND)[number];

export const ACTIVITY_STATUS = ['DRAFT', 'LIVE', 'CLOSED', 'REVEALED'] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUS)[number];

export const TOPIC_STATUS = ['OPEN', 'ANSWERED_IN_CLASS', 'REPLIED'] as const;
export type TopicStatus = (typeof TOPIC_STATUS)[number];

/** Rule 9: sessions auto-end after 6 h LIVE; Take-away visible 24 h after end. */
export const SESSION_MAX_LIVE_MS = 6 * 60 * 60 * 1000;
export const TAKEAWAY_VISIBLE_MS = 24 * 60 * 60 * 1000;

export type ApiError = { error: { code: string; message: string } };
export type HealthResponse = { ok: boolean; db: boolean };

// ─── Instructor REST DTOs ───────────────────────────────────────────────────
export type Me = { id: string; name: string; email: string };
export type SocketTokenResponse = { token: string };

export type CourseDto = { id: string; name: string; createdAt: string; sessionCount: number };

export type SessionListItem = {
  id: string;
  code: string;
  topic: string;
  status: SessionStatus;
  courseId: string | null;
  startedAt: string;
  endedAt: string | null;
  joined: number;
  questions: number;
};

export type CreatedSession = { id: string; code: string };

// ─── Snapshots (filled in phase by phase; empty arrays until the feature exists) ─
export type HostSession = {
  id: string;
  code: string;
  topic: string;
  status: SessionStatus;
  academicMode: boolean;
  joinedCount: number;
  flaggedCount: number;
  startedAt: string;
  endedAt: string | null;
  courseId: string | null;
};

// ─── Q&A DTOs (no device hash, ever) ─────────────────────────────────────────
export type HostPart = { id: string; number: number; flaggedCount: number; createdAt: string };
export type HostQuestion = {
  id: string;
  partId: string;
  topicId: string | null;
  text: string;
  addressed: boolean;
  createdAt: string;
};
export type HostTopic = {
  id: string;
  partId: string;
  title: string;
  status: TopicStatus;
  reply: string | null;
  meTooCount: number;
  createdAt: string;
};
/** What every student sees about a topic (no questions, no identities). */
export type PublicTopic = {
  id: string;
  title: string;
  status: TopicStatus;
  reply: string | null;
  meTooCount: number;
  questionCount: number;
};
export type StudentTopic = PublicTopic & { iMeToo: boolean };

export type HostState = {
  version: number;
  session: HostSession;
  parts: HostPart[]; // ordered by number
  questions: HostQuestion[]; // newest first
  topics: HostTopic[];
  activities: unknown[]; // Phase 4
  liveActivityId: string | null;
};

export type PresentState = {
  version: number;
  session: { code: string; topic: string; status: SessionStatus; joinedCount: number };
  activities: unknown[]; // Phase 5
  liveActivityId: string | null;
  projected: null; // Phase 5
};

export type StudentState = {
  version: number;
  /** `id` is the session's random uuid (not an identity); students key local history by it. */
  session: { id: string; topic: string; status: SessionStatus };
  liveActivity: null; // Phase 4
  myResponse: null; // Phase 4
  // No `myQuestions` from the server: a stealth-blocked question is never stored, so a server list would
  // reveal the block. "My questions" is kept on the phone (spec E: "from localStorage").
  topics: StudentTopic[]; // sorted (sortTopics)
  takeawayPublished: boolean;
};

export type PublicSessionInfo = { topic: string; status: SessionStatus };

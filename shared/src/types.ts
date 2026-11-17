import type { Answer, RoundStats } from './rules';

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
  activities: number;
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

// ─── Activities (Quick Check) ───────────────────────────────────────────────

/** Rule 3: `correct`, `explanation`, `tolerance` exist ONLY when status is REVEALED. Never `modelAnswer`. */
export type StudentActivity = {
  id: string;
  type: ActivityType;
  kind: QuickCheckKind | null;
  prompt: string;
  options: string[];
  status: ActivityStatus;
  round: number;
  correct?: Answer;
  explanation?: string;
  tolerance?: number | null;
  /** Server time when the question auto-closes (timer), or null. Not a leak: everyone sees the timer. */
  closesAt: string | null;
};

/**
 * This device's answer for the activity's current round (so a refreshed phone shows "Answer sent").
 * Explain: `answer` is null and the text is not echoed back (a stealth-blocked one has no text).
 */
export type MyResponse = { round: number; answer: Answer | null; confident: boolean | null };

export type ExplainTag = 'CORRECT' | 'PARTIAL' | 'MISCONCEPTION';
/** An Explain answer as the instructor sees it: no identity, ever. */
export type ExplainAnswer = { id: string; text: string; tag: ExplainTag | null };

export type HostActivity = {
  id: string;
  type: ActivityType;
  kind: QuickCheckKind | null;
  prompt: string;
  options: string[];
  correct: Answer | null;
  tolerance: number | null;
  explanation: string | null;
  modelAnswer: string | null;
  status: ActivityStatus;
  round: number;
  position: number;
  closesAt: string | null;
  /** One entry per round played so far (round 1 … current). */
  stats: RoundStats[];
  /** Explain: answers submitted (incl. ones moderation dropped). */
  responseCount: number;
  /** Explain, once closed: the answers with their tags (blocked ones are never stored with text). */
  explainAnswers: ExplainAnswer[];
};

/** Projector view: like the host's, minus modelAnswer (and Explain texts, Phase 6). */
export type PresentActivity = Omit<HostActivity, 'modelAnswer' | 'explainAnswers'>;

export type ActivityStats = { activityId: string; round: number; responses: number; joined: number };

export type HostState = {
  version: number;
  session: HostSession;
  parts: HostPart[]; // ordered by number
  questions: HostQuestion[]; // newest first
  topics: HostTopic[];
  activities: HostActivity[]; // run order
  liveActivityId: string | null;
  /** The activity "on stage" for phones/projector (LIVE, or just closed/revealed), or null. */
  stageActivityId: string | null;
  /** Topic / Explain answer currently shown on the projector (so the host can see / stop it), or null. */
  projectedTopicId: string | null;
  projectedAnswerId: string | null;
  serverTime: string;
};

/** A Q&A topic as shown on the projector: anonymous questions, counts, reply. */
export type ProjectedTopic = {
  id: string;
  title: string;
  status: TopicStatus;
  reply: string | null;
  meTooCount: number;
  questions: string[];
};
/** What the projector shows over the stage activity; topics come resolved. */
export type ProjectedView =
  | { kind: 'welcome' }
  | { kind: 'blank' }
  | { kind: 'wrap' }
  | { kind: 'topic'; id: string; topic: ProjectedTopic }
  | { kind: 'misconception'; id: string; prompt: string; text: string };

export type PresentState = {
  version: number;
  /** For countdowns: clients compute their offset from this, not from their own clock. */
  serverTime: string;
  session: { code: string; topic: string; status: SessionStatus; joinedCount: number };
  activities: PresentActivity[];
  liveActivityId: string | null;
  stageActivityId: string | null;
  projected: ProjectedView | null;
  settings: { timerSec: 0 | 30 | 60 | 90; autoReveal: boolean };
};

export type StudentState = {
  version: number;
  /** `id` is the session's random uuid (not an identity); students key local history by it. */
  session: { id: string; topic: string; status: SessionStatus };
  /** The activity on stage (LIVE, CLOSED or REVEALED) — the phone switches to it — or null. */
  liveActivity: StudentActivity | null;
  myResponse: MyResponse | null;
  // No `myQuestions` from the server: a stealth-blocked question is never stored, so a server list would
  // reveal the block. "My questions" is kept on the phone (spec E: "from localStorage").
  topics: StudentTopic[]; // sorted (sortTopics)
  takeawayPublished: boolean;
};

export type PublicSessionInfo = { topic: string; status: SessionStatus };

// ─── Take-away ──────────────────────────────────────────────────────────────

export type TakeawayTopic = {
  id: string;
  title: string;
  meTooCount: number;
  questionCount: number;
  status: TopicStatus;
  reply: string | null;
};

/** Instructor editor (GET /sessions/:code/takeaway/draft). */
export type TakeawayDraft = {
  status: 'DRAFT' | 'PUBLISHED';
  keyPoints: string[];
  topTopicIds: string[];
  /** Every topic of the session, most Me too first, to pick from. */
  topics: TakeawayTopic[];
  publishedAt: string | null;
};

/** What students get (GET /public/sessions/:code/takeaway). */
export type PublicTakeaway = {
  sessionId: string;
  topic: string;
  endedAt: string;
  /** endedAt + 24 h: "This page disappears 24 hours after the lecture ends." */
  expiresAt: string;
  keyPoints: string[];
  topics: Omit<TakeawayTopic, 'id' | 'questionCount'>[];
};

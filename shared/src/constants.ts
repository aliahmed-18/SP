// Plain constants shared by client and server. NO zod import here: phones load this, not schemas.ts.

export const LIMITS = {
  passwordMin: 8,
  passwordMax: 200,
  nameMax: 80,
  emailMax: 254,
  courseNameMax: 100,
  lectureTopicMax: 80,
  questionMax: 300,
  topicTitleMax: 100,
  replyMax: 2000,
  /** Rule 6: min gap between questions per device, max questions per device per session. */
  questionMinGapMs: 5_000,
  questionsPerDevice: 40,
} as const;

export const INVALID_CODE_MESSAGE = "That session doesn't exist or has expired.";

export const ACTIVITY_LIMITS = {
  promptMax: 2000,
  optionMax: 300,
  optionsMin: 2,
  optionsMax: 5,
  explanationMax: 2000,
} as const;

export const TIMER_CHOICES = [0, 30, 60, 90] as const;

export const ADD_TIME_SECONDS = 15;

export const DEFAULT_PRESENT_SETTINGS: { timerSec: 0 | 30 | 60 | 90; autoReveal: boolean } = {
  timerSec: 0,
  autoReveal: true,
};

/** Explain answers: a few sentences (about 150 words) — room to explain, still readable on a phone. */
export const EXPLAIN_MAX = 1000;

export const TAKEAWAY_LIMITS = { keyPoints: 10, keyPointMax: 300 } as const;

export const EXPLAIN_TAGS = ['CORRECT', 'PARTIAL', 'MISCONCEPTION'] as const;

/** Optional AI helpers (stretch phase): drafts only, the instructor always reviews them. */
export const AI_LIMITS = {
  slideTextMin: 200,
  slideTextMax: 30_000,
  generateMax: 8,
  /** Grouping looks at the newest ungrouped questions of the current part, up to this many. */
  groupQuestionsMax: 150,
  groupQuestionsMin: 3,
  /** Uploaded slides / notes: read in the browser (files never reach the server). */
  filesMax: 8,
  fileSizeMaxMb: 60,
  noteMax: 300,
  /** Grading Explain answers with AI: any number from one. */
  explainAnswersMin: 1,
  explainAnswersMax: 300,
} as const;

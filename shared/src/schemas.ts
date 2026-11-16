import { z } from 'zod';
import { CODE_REGEX, normalizeJoinCode } from './codes';

// Zod schemas shared by client and server (CLAUDE.md §4.1: the server validates every input with these).

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

/** Accepts what a person typed (" bc eu3") and returns the canonical code, or fails. */
export const joinCodeSchema = z
  .string()
  .transform(normalizeJoinCode)
  .pipe(z.string().regex(CODE_REGEX, INVALID_CODE_MESSAGE));

export const deviceIdSchema = z.string().uuid('Invalid device id.');

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(LIMITS.emailMax)
  .pipe(z.email('Enter a valid email address.'));

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(LIMITS.nameMax, 'Name is too long.'),
  email,
  password: z
    .string()
    .min(LIMITS.passwordMin, `Password must be at least ${LIMITS.passwordMin} characters.`)
    .max(LIMITS.passwordMax, 'Password is too long.'),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password.').max(LIMITS.passwordMax),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const courseSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter a course name.')
    .max(LIMITS.courseNameMax, `Course name must be ${LIMITS.courseNameMax} characters or fewer.`),
});
export type CourseInput = z.infer<typeof courseSchema>;

export const createSessionSchema = z.object({
  courseId: z.string().uuid().nullish(),
  topic: z
    .string()
    .trim()
    .min(1, 'Enter the lecture topic.')
    .max(LIMITS.lectureTopicMax, `Topic must be ${LIMITS.lectureTopicMax} characters or fewer.`),
  academicMode: z.boolean().default(true),
});
export type CreateSessionInput = z.input<typeof createSessionSchema>;

export const idParamSchema = z.object({ id: z.string().uuid('Not found.') });
export const codeParamSchema = z.object({ code: joinCodeSchema });

/** Socket.io handshake `auth` payloads (docs/04 §Connection & rooms). */
export const socketAuthSchema = z.discriminatedUnion('role', [
  z.object({ role: z.literal('student'), code: joinCodeSchema, deviceId: deviceIdSchema }),
  z.object({ role: z.literal('host'), code: joinCodeSchema, token: z.string().min(1) }),
  z.object({ role: z.literal('present'), code: joinCodeSchema, token: z.string().min(1) }),
]);
export type SocketAuth = z.input<typeof socketAuthSchema>;
export type SocketRole = SocketAuth['role'];

// ─── Q&A (Phase 3) ──────────────────────────────────────────────────────────

/** Raw text from the phone; the server cleans + moderates it (moderation.ts). Upper bound only guards size. */
export const askQuestionSchema = z.object({ text: z.string().max(4000) });

export const meTooSchema = z.object({ topicId: z.string().uuid(), on: z.boolean() });

const topicTitle = z
  .string()
  .trim()
  .min(1, 'Enter a topic title.')
  .max(LIMITS.topicTitleMax, `Topic title must be ${LIMITS.topicTitleMax} characters or fewer.`);
const questionIds = z.array(z.string().uuid()).max(500);

export const createTopicSchema = z.object({ title: topicTitle, questionIds: questionIds.default([]) });
export type CreateTopicInput = z.input<typeof createTopicSchema>;

export const updateTopicSchema = z
  .object({
    title: topicTitle.optional(),
    status: z.enum(['OPEN', 'ANSWERED_IN_CLASS', 'REPLIED']).optional(),
    reply: z
      .string()
      .trim()
      .max(LIMITS.replyMax, `Reply must be ${LIMITS.replyMax} characters or fewer.`)
      .nullable()
      .optional(),
  })
  .refine(
    (d) => d.status !== 'REPLIED' || (d.reply !== undefined && d.reply !== null && d.reply.length > 0),
    {
      message: 'Write a reply first.',
    },
  );
export type UpdateTopicInput = z.input<typeof updateTopicSchema>;

export const moveQuestionsSchema = z.object({
  questionIds: questionIds.min(1, 'Select at least one question.'),
});

export const updateQuestionSchema = z
  .object({ addressed: z.boolean().optional(), topicId: z.string().uuid().nullable().optional() })
  .refine((d) => d.addressed !== undefined || d.topicId !== undefined, { message: 'Nothing to change.' });
export type UpdateQuestionInput = z.input<typeof updateQuestionSchema>;

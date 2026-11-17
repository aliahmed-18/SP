import { z } from 'zod';
import { CODE_REGEX, normalizeJoinCode } from './codes';
import {
  ACTIVITY_LIMITS,
  EXPLAIN_TAGS,
  INVALID_CODE_MESSAGE,
  LIMITS,
  TAKEAWAY_LIMITS,
} from './constants';

// Plain constants live in constants.ts (no zod), so phones don't download zod just to read a limit.
export * from './constants';

// Zod schemas shared by client and server (CLAUDE.md §4.1: the server validates every input with these).

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

// ─── Quick Check (Phase 4) ──────────────────────────────────────────────────

const prompt = z
  .string()
  .trim()
  .min(1, 'Write the question.')
  .max(ACTIVITY_LIMITS.promptMax, 'The question is too long.');
const explanation = z
  .string()
  .trim()
  .min(1, 'Write an explanation — students see it when you reveal the answer.')
  .max(ACTIVITY_LIMITS.explanationMax, 'The explanation is too long.');
const option = z
  .string()
  .trim()
  .min(1, 'Options cannot be empty.')
  .max(ACTIVITY_LIMITS.optionMax, 'An option is too long.');
const finite = z.number().finite().min(-1e12).max(1e12);

/** A Quick Check draft (spec C2). The server validates every create/edit with this. */
export const quickCheckDraftSchema = z.discriminatedUnion('kind', [
  z
    .object({
      type: z.literal('QUICK_CHECK'),
      kind: z.literal('MCQ'),
      prompt,
      options: z
        .array(option)
        .min(ACTIVITY_LIMITS.optionsMin, 'Add at least 2 options.')
        .max(ACTIVITY_LIMITS.optionsMax, 'Up to 5 options.'),
      correct: z.number().int().min(0),
      explanation,
    })
    .refine((d) => d.correct < d.options.length, {
      message: 'Choose the correct option.',
      path: ['correct'],
    }),
  z.object({
    type: z.literal('QUICK_CHECK'),
    kind: z.literal('TRUE_FALSE'),
    prompt,
    correct: z.boolean(),
    explanation,
  }),
  z.object({
    type: z.literal('QUICK_CHECK'),
    kind: z.literal('NUMERIC'),
    prompt,
    correct: finite,
    tolerance: z.number().finite().min(0, 'Tolerance cannot be negative.').max(1e12),
    explanation,
  }),
]);
export type QuickCheckDraft = z.infer<typeof quickCheckDraftSchema>;
export type QuickCheckDraftInput = z.input<typeof quickCheckDraftSchema>;

/** After launch only the wording can change (fair results): prompt, explanation, option texts. */
export const activityTextFixSchema = z.object({
  prompt,
  explanation,
  options: z.array(option).max(ACTIVITY_LIMITS.optionsMax).optional(),
});

export const reorderSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });
export const copyActivitiesSchema = z.object({ fromSessionId: z.string().uuid() });

export const activityIdSchema = z.object({ activityId: z.string().uuid() });
export const closeActivitySchema = activityIdSchema.extend({ reveal: z.boolean().optional() });

export const answerSchema = z.object({
  activityId: z.string().uuid(),
  round: z.number().int().min(1).max(50),
  answer: z.union([finite, z.boolean()]),
});
export const confidenceSchema = z.object({
  activityId: z.string().uuid(),
  round: z.number().int().min(1).max(50),
  confident: z.boolean().nullable(),
});

// ─── Present mode (Phase 5) ─────────────────────────────────────────────────

export const presentSettingsSchema = z.object({
  timerSec: z.union([z.literal(0), z.literal(30), z.literal(60), z.literal(90)]),
  autoReveal: z.boolean(),
});
export type PresentSettings = z.infer<typeof presentSettingsSchema>;

/** What the projector shows instead of the stage activity (null = the activity / welcome). */
export const projectSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('welcome') }),
  z.object({ kind: z.literal('blank') }),
  z.object({ kind: z.literal('wrap') }),
  z.object({ kind: z.literal('topic'), id: z.string().uuid() }),
  /** One Explain answer tagged MISCONCEPTION, shown anonymously (spec C3). */
  z.object({ kind: z.literal('misconception'), id: z.string().uuid() }),
]);
export type ProjectedItem = z.infer<typeof projectSchema>;
export const projectPayloadSchema = z.object({ item: projectSchema.nullable() });

export const launchSchema = activityIdSchema.extend({
  /** Projector: seconds until the question auto-closes (0/absent = no timer). */
  timerSec: z.number().int().min(0).max(600).optional(),
});

// ─── Explain + Take-away (Phase 6) ──────────────────────────────────────────

/** Explain draft: a prompt + an optional model answer (never sent to students or the projector). */
export const explainDraftSchema = z.object({
  type: z.literal('EXPLAIN'),
  prompt,
  modelAnswer: z
    .string()
    .trim()
    .max(ACTIVITY_LIMITS.explanationMax, 'The model answer is too long.')
    .default(''),
});
export type ExplainDraftInput = z.input<typeof explainDraftSchema>;

/** Any new activity: a Quick Check or an Explain. */
export const activityDraftSchema = z.union([quickCheckDraftSchema, explainDraftSchema]);

/** Wording fixes on an Explain that has run. */
export const explainTextFixSchema = z.object({
  prompt,
  modelAnswer: z.string().trim().max(ACTIVITY_LIMITS.explanationMax).default(''),
});

export const explainSubmitSchema = z.object({ activityId: z.string().uuid(), text: z.string().max(2000) });

export const tagSchema = z.object({ tag: z.enum(EXPLAIN_TAGS).nullable() });

export const takeawaySaveSchema = z.object({
  keyPoints: z
    .array(
      z
        .string()
        .trim()
        .min(1, 'Key points cannot be empty.')
        .max(TAKEAWAY_LIMITS.keyPointMax, 'A key point is too long.'),
    )
    .max(TAKEAWAY_LIMITS.keyPoints, `Up to ${TAKEAWAY_LIMITS.keyPoints} key points.`),
  topTopicIds: z.array(z.string().uuid()).max(20),
  /** Fill missing replies from the editor: topicId → reply text (sets the topic to REPLIED). */
  replies: z.record(z.string().uuid(), z.string().trim().max(2000)).default({}),
});
export type TakeawaySaveInput = z.input<typeof takeawaySaveSchema>;

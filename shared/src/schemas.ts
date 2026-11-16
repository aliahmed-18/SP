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

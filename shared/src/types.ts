// Shared enum-like names (CLAUDE.md §5). Kept as string unions so client code never imports Prisma.
export const SESSION_STATUS = ['LIVE', 'ENDED'] as const;
export type SessionStatus = (typeof SESSION_STATUS)[number];

export const ACTIVITY_TYPE = ['QUICK_CHECK', 'EXPLAIN'] as const;
export type ActivityType = (typeof ACTIVITY_TYPE)[number];

export const QUICK_CHECK_KIND = ['MCQ', 'TRUE_FALSE', 'NUMERIC'] as const;
export type QuickCheckKind = (typeof QUICK_CHECK_KIND)[number];

export const ACTIVITY_STATUS = ['DRAFT', 'LIVE', 'CLOSED', 'REVEALED'] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUS)[number];

export type ApiError = { error: { code: string; message: string } };

export type HealthResponse = { ok: boolean; db: boolean };

// Things only this phone knows (never sent to the server). Keyed by session id, because join codes are
// reused after a session ends. Every access is guarded: private mode may block storage.

export type MyQuestion = { text: string; sentAt: string };

function read<T>(storage: () => Storage, key: string, fallback: T): T {
  try {
    const raw = storage().getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(storage: () => Storage, key: string, value: unknown) {
  try {
    storage().setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the UI still works for this page view */
  }
}

const local = () => window.localStorage;
const session = () => window.sessionStorage;

/** "My questions" (spec E): every question this device sent, including ones the server silently dropped. */
export function getMyQuestions(sessionId: string): MyQuestion[] {
  const rows = read<unknown>(local, `getit.questions.${sessionId}`, []);
  return Array.isArray(rows) ? (rows as MyQuestion[]).filter((r) => typeof r?.text === 'string') : [];
}

export function addMyQuestion(sessionId: string, q: MyQuestion): MyQuestion[] {
  const next = [q, ...getMyQuestions(sessionId)];
  write(local, `getit.questions.${sessionId}`, next);
  return next;
}

/** Ask-box draft survives activity switches and refresh (spec E), but not closing the tab. */
export function getDraft(sessionId: string): string {
  return read(session, `getit.draft.${sessionId}`, '');
}

export function setDraft(sessionId: string, text: string) {
  write(session, `getit.draft.${sessionId}`, text);
}

// ─── Quick Check (Phase 4) ──────────────────────────────────────────────────

/** A revealed Quick Check as this phone saw it — for the Take-away review (spec F). Never sent anywhere. */
export type SavedCheck = {
  activityId: string;
  round: number;
  question: string;
  myAnswer: string;
  correctAnswer: string;
  explanation: string;
  confident: boolean | null;
  wasCorrect: boolean;
};

export function getSavedChecks(sessionId: string): SavedCheck[] {
  const rows = read<unknown>(local, `getit.checks.${sessionId}`, []);
  return Array.isArray(rows) ? (rows as SavedCheck[]) : [];
}

/** Upsert by activity + round. */
export function saveCheck(sessionId: string, check: SavedCheck) {
  const rows = getSavedChecks(sessionId).filter(
    (r) => r.activityId !== check.activityId || r.round !== check.round,
  );
  write(local, `getit.checks.${sessionId}`, [...rows, check]);
}

/** Screens the student closed with "Back to the lecture" (per activity, round and status). */
export function isDismissed(key: string): boolean {
  return read<string[]>(session, 'getit.dismissed', []).includes(key);
}
export function dismiss(key: string) {
  write(session, 'getit.dismissed', [...read<string[]>(session, 'getit.dismissed', []), key].slice(-200));
}

/** Whether this phone already answered "How sure are you?" (Skip is stored as null server-side). */
export function hasChosenConfidence(key: string): boolean {
  return read<string[]>(session, 'getit.confidence', []).includes(key);
}
export function markConfidenceChosen(key: string) {
  write(session, 'getit.confidence', [...read<string[]>(session, 'getit.confidence', []), key].slice(-200));
}

/** Last time this phone sent a question (survives the Ask sheet closing), for the 5 s gap. */
const lastSent = new Map<string, number>();
export const getLastSent = (sessionId: string) => lastSent.get(sessionId) ?? 0;
export const setLastSent = (sessionId: string, at: number) => lastSent.set(sessionId, at);

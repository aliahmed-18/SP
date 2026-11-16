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

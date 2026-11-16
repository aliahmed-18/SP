// Zero-account identity: random tokens kept only in this browser's localStorage.
const hasStorage = () => typeof window !== "undefined" && !!window.localStorage;

export function getInstructorKey(code: string): string | null {
  if (!hasStorage()) return null;
  return localStorage.getItem(`getit.instructor.${code.toUpperCase()}`);
}
export function saveInstructorKey(code: string, key: string) {
  localStorage.setItem(`getit.instructor.${code.toUpperCase()}`, key);
}

export function getDeviceId(): string {
  let id = localStorage.getItem("getit.device");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("getit.device", id);
  }
  return id;
}

export type MyQuestion = { text: string; at: number };
export function getMyQuestions(code: string): MyQuestion[] {
  if (!hasStorage()) return [];
  try {
    return JSON.parse(localStorage.getItem(`getit.myq.${code}`) ?? "[]") as MyQuestion[];
  } catch {
    return [];
  }
}
export function addMyQuestion(code: string, text: string): MyQuestion[] {
  const list = [{ text, at: Date.now() }, ...getMyQuestions(code)].slice(0, 40);
  localStorage.setItem(`getit.myq.${code}`, JSON.stringify(list));
  return list;
}

/**
 * Sessions this instructor started on this device, so they can get back to one (to publish the
 * Take-away or download results) after leaving. Sessions are deleted on the server 24 h after they
 * end (at most 30 h after they start), so older entries are dropped.
 */
export type MySession = { code: string; topic: string; createdAt: number; ended?: boolean };
const MY_SESSIONS = "getit.mySessions";
const KEEP_MS = 30 * 3600_000;
export function listMySessions(now = Date.now()): MySession[] {
  if (!hasStorage()) return [];
  try {
    const list = JSON.parse(localStorage.getItem(MY_SESSIONS) ?? "[]") as MySession[];
    return list.filter(s => s && typeof s.code === "string" && now - s.createdAt < KEEP_MS && !!getInstructorKey(s.code))
      .sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
  } catch { return []; }
}
export function rememberSession(session: MySession) {
  if (!hasStorage()) return;
  try {
    const others = (JSON.parse(localStorage.getItem(MY_SESSIONS) ?? "[]") as MySession[]).filter(s => s?.code !== session.code);
    localStorage.setItem(MY_SESSIONS, JSON.stringify([session, ...others].slice(0, 20)));
  } catch { /* not remembered */ }
}
export function forgetSession(code: string) {
  if (!hasStorage()) return;
  try { localStorage.setItem(MY_SESSIONS, JSON.stringify((JSON.parse(localStorage.getItem(MY_SESSIONS) ?? "[]") as MySession[]).filter(s => s?.code !== code))); } catch { /* ignore */ }
}

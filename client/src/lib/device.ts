// Rule 2: a student is only a random device id in localStorage. The server stores sha256(id + salt).
const KEY = 'getit.device';
let memoryFallback: string | null = null;

/** RFC 4122 v4 uuid. `crypto.randomUUID` needs a secure context (https / localhost); phones on
 *  http://<laptop-ip>:5173 don't have one, so fall back to getRandomValues (available everywhere). */
function uuid(): string {
  if (typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      /* insecure context */
    }
  }
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing && UUID_RE.test(existing)) return existing;
    const id = uuid();
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    // Storage blocked (private mode on some browsers): keep one id for this page's lifetime.
    memoryFallback ??= uuid();
    return memoryFallback;
  }
}

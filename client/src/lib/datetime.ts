// Dates for the calendar. The server stores UTC; everything shown and typed is in the device's time zone.

const pad = (n: number) => String(n).padStart(2, '0');

/** Local "YYYY-MM-DD" (for <input type="date"> and day keys). */
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Local "HH:MM" (for <input type="time">). */
export const timeValue = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
/** Local date + time inputs → a Date (local time zone), or null if incomplete/invalid. */
export function fromInputs(date: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const d = new Date(`${date}T${time}:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const sameDay = (a: Date, b: Date) => dayKey(a) === dayKey(b);

/** The next full hour (at least 10 minutes away) — the default for a new plan. */
export function nextFullHour(now = new Date()) {
  const d = new Date(now);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + (now.getMinutes() >= 50 ? 2 : 1));
  return d;
}

/** "in 2 h 5 min", "in 3 days", "now". */
export function untilText(target: Date, now = new Date()) {
  const ms = target.getTime() - now.getTime();
  if (ms <= 30_000) return 'now';
  const min = Math.round(ms / 60_000);
  if (min < 60) return `in ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `in ${h} h${min % 60 ? ` ${min % 60} min` : ''}`;
  const days = Math.round(h / 24);
  return `in ${days} ${days === 1 ? 'day' : 'days'}`;
}

export const fmt = {
  dayTime: new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }),
  longDay: new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }),
  time: new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }),
  month: new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }),
  weekday: new Intl.DateTimeFormat('en-GB', { weekday: 'short' }),
};

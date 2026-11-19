// "Add to calendar" for a planned lecture: one iCalendar (RFC 5545) event, readable by Google Calendar,
// Outlook and Apple Calendar. Pure, so it is unit-tested.

const stamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, ''); // 20261120T080000Z
/** Text values: escape backslash, ; , and newlines (RFC 5545 §3.3.11). */
const text = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Lines longer than 75 octets are folded: CRLF + one space (RFC 5545 §3.1). */
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  for (const ch of line) {
    if (Buffer.byteLength(current + ch, 'utf8') > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = '';
    }
    current += ch;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

export function lectureIcs(input: {
  id: string;
  topic: string;
  code: string;
  start: Date;
  durationMin: number | null;
  baseUrl: string;
  now?: Date;
}): string {
  const end = new Date(input.start.getTime() + (input.durationMin ?? 60) * 60_000);
  const join = `${input.baseUrl}/join/${input.code}`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Getit//Lecture calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${input.id}@getit`,
    `DTSTAMP:${stamp(input.now ?? new Date())}`,
    `DTSTART:${stamp(input.start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${text(`Getit lecture: ${input.topic}`)}`,
    `DESCRIPTION:${text(`Join code: ${input.code}\nStudents join at: ${join}\nYour session: ${input.baseUrl}/s/${input.code}/host`)}`,
    `URL:${input.baseUrl}/s/${input.code}/host`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${text(`Getit lecture in 15 minutes: ${input.topic}`)}`,
    'TRIGGER:-PT15M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

import type { SessionListItem } from '@getit/shared';

/** When a lecture sits in the calendar: its planned time while SCHEDULED, else when it really started. */
export const lectureTime = (s: SessionListItem) =>
  new Date(s.status === 'SCHEDULED' && s.scheduledFor ? s.scheduledFor : s.startedAt);

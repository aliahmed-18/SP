const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

/** "14:05" */
export const formatTime = (iso: string) => time.format(new Date(iso));

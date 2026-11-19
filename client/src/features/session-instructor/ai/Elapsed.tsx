import { useEffect, useState } from 'react';

/** "12 s": seconds since `since` (or since mount), so a long AI wait visibly isn't frozen. */
export function Elapsed({ since }: { since?: string }) {
  const [start] = useState(() => (since ? Date.parse(since) : Date.now()));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="tabular-nums">{Math.max(0, Math.floor((now - start) / 1000))} s</span>;
}

import { useEffect, useState } from 'react';

/** "12 s": seconds since mount, so a long AI wait visibly isn't frozen. */
export function Elapsed() {
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(start);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="tabular-nums">{Math.floor((now - start) / 1000)} s</span>;
}

import { useCallback, useState } from 'react';
import type { HostState } from '@getit/shared';
import { useLiveSocket } from '@/hooks/use-live-socket';
import type { GetitSocket } from '@/lib/socket';

/** Host view state: replaced by every snapshot, patched by live events. */
export function useHostState(code: string) {
  const [state, setState] = useState<HostState | null>(null);

  const register = useCallback((s: GetitSocket) => {
    s.on('state:host', setState);
    s.on('session:joined', ({ joinedCount }) =>
      setState((prev) => (prev ? { ...prev, session: { ...prev.session, joinedCount } } : prev)),
    );
    s.on('session:ended', ({ endedAt }) =>
      setState((prev) => (prev ? { ...prev, session: { ...prev.session, status: 'ENDED', endedAt } } : prev)),
    );
  }, []);

  const live = useLiveSocket('host', code, register);
  return { state, setState, ...live };
}

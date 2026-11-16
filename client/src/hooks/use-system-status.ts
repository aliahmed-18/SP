import { useEffect, useState } from 'react';
import type { HealthResponse } from '@getit/shared';
import { api } from '@/lib/api';
import { createSocket } from '@/lib/socket';

export type SystemStatus = {
  socket: 'connecting' | 'connected' | 'reconnecting';
  pingMs: number | null;
  db: boolean | null;
};

/** Phase 1 skeleton check: socket round-trip + /api/health. Removed from the home page in Phase 2. */
export function useSystemStatus(): SystemStatus {
  const [status, setStatus] = useState<SystemStatus>({ socket: 'connecting', pingMs: null, db: null });

  useEffect(() => {
    const socket = createSocket();
    let alive = true;

    const ping = async () => {
      const started = performance.now();
      try {
        const res = await socket.timeout(5000).emitWithAck('system:ping');
        if (alive && res.ok) setStatus((s) => ({ ...s, pingMs: Math.round(performance.now() - started) }));
      } catch {
        /* timeout: the disconnect handler shows "reconnecting" */
      }
    };
    const health = () =>
      api<HealthResponse>('/health')
        .then((h) => alive && setStatus((s) => ({ ...s, db: h.db })))
        .catch(() => alive && setStatus((s) => ({ ...s, db: false })));

    socket.on('connect', () => {
      setStatus((s) => ({ ...s, socket: 'connected' }));
      void ping();
      void health();
    });
    socket.on('disconnect', () => setStatus((s) => ({ ...s, socket: 'reconnecting', pingMs: null })));
    socket.connect();
    void health();

    return () => {
      alive = false;
      socket.close();
    };
  }, []);

  return status;
}

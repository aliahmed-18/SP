import { useCallback, useEffect, useRef, useState } from 'react';
import { SOCKET_REFUSAL, type SocketRefusal } from '@getit/shared';
import { createLiveSocket, type GetitSocket, type LiveRole } from '@/lib/socket';

export type LiveStatus = 'connecting' | 'connected' | 'reconnecting' | 'refused';

const FINAL_REFUSALS = new Set<string>(Object.values(SOCKET_REFUSAL));

/**
 * One socket per screen. Rule 7: the server sends a full snapshot on every (re)connect; we also ask for
 * one when the tab becomes visible or the browser comes back online. `register` attaches the screen's
 * event handlers (they replace / patch local state). It must be stable (wrap it in useCallback).
 */
export function useLiveSocket(
  role: LiveRole,
  code: string,
  register: (socket: GetitSocket) => void,
): { status: LiveStatus; refusal: SocketRefusal | null; getSocket: () => GetitSocket | null } {
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const [refusal, setRefusal] = useState<SocketRefusal | null>(null);
  const socketRef = useRef<GetitSocket | null>(null);

  useEffect(() => {
    const s = createLiveSocket(role, code);
    let retry: ReturnType<typeof setTimeout> | undefined;
    let everConnected = false;

    register(s);
    s.on('connect', () => {
      everConnected = true;
      setStatus('connected');
      setRefusal(null);
    });
    s.on('disconnect', (reason) => {
      if (reason === 'io client disconnect') return;
      setStatus('reconnecting');
    });
    s.on('connect_error', (err) => {
      if (FINAL_REFUSALS.has(err.message)) {
        setRefusal(err.message as SocketRefusal);
        setStatus('refused');
        return;
      }
      setStatus(everConnected ? 'reconnecting' : 'connecting');
      // Transport errors retry automatically; a server-side handshake error does not, so retry ourselves.
      if (!s.active) {
        clearTimeout(retry);
        retry = setTimeout(() => s.connect(), 2000);
      }
    });

    const resync = () => {
      if (document.visibilityState !== 'visible') return;
      if (s.connected) s.emit('state:request');
      else if (!s.active) s.connect();
    };
    document.addEventListener('visibilitychange', resync);
    window.addEventListener('online', resync);

    socketRef.current = s;
    s.connect();
    return () => {
      clearTimeout(retry);
      document.removeEventListener('visibilitychange', resync);
      window.removeEventListener('online', resync);
      s.removeAllListeners();
      s.close();
      socketRef.current = null;
    };
  }, [role, code, register]);

  const getSocket = useCallback(() => socketRef.current, []);
  return { status, refusal, getSocket };
}

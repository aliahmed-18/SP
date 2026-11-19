import { useQuery } from '@tanstack/react-query';
import { api } from './api';

const LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/;

/**
 * The address phones should open (QR, "go to …"): the public / tunnel address the server knows about
 * (`npm run share`, or PUBLIC_URL), else this page's own address. Rechecked every few seconds, so
 * starting a tunnel updates the QR without a reload. Instructor screens only.
 */
export function usePublicOrigin() {
  const q = useQuery({
    queryKey: ['public-config'],
    queryFn: () => api<{ publicUrl: string | null }>('/public/config'),
    refetchInterval: 10_000,
    retry: false,
  });
  const publicUrl = q.data?.publicUrl ?? null;
  return {
    origin: publicUrl ?? window.location.origin,
    /** The page runs on localhost and no public address is known: phones can't open the QR. */
    localOnly: !publicUrl && LOCAL.test(window.location.hostname),
    tunnel: !!publicUrl,
  };
}

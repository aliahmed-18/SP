import { useQuery } from '@tanstack/react-query';
import type { Me } from '@getit/shared';
import { api, ApiRequestError } from '@/lib/api';

export const meQueryKey = ['me'] as const;

/** The logged-in instructor, or null when logged out. */
export function useMe() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: async (): Promise<Me | null> => {
      try {
        return await api<Me>('/auth/me');
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 60_000,
  });
}

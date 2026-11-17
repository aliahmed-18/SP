import { createContext, useContext } from 'react';
import type { GetitSocket } from '@/lib/socket';

/** What deep host components need from the page: the live socket and what the projector shows. */
export type HostContextValue = {
  getSocket: () => GetitSocket | null;
  projectedTopicId: string | null;
  projectedAnswerId: string | null;
};

export const HostContext = createContext<HostContextValue>({
  getSocket: () => null,
  projectedTopicId: null,
  projectedAnswerId: null,
});
export const useHost = () => useContext(HostContext);

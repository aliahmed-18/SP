import { useCallback, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'getit.theme';
const listeners = new Set<() => void>();

function read(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* private mode: theme still applies for this page */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Light/dark toggle stored in localStorage (index.html applies it before first paint). */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, read, () => 'light' as Theme);
  const toggle = useCallback(() => apply(read() === 'dark' ? 'light' : 'dark'), []);
  return { theme, toggle, setTheme: apply };
}

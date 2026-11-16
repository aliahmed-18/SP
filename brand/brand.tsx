// Getit brand components — copy to client/src/components/brand/brand.tsx
// Depends on ./brand-paths.ts (the exact vector paths of the logo). Do NOT redraw the logo.
import { useEffect, useState } from 'react';
import { MARK, WORDMARK } from './brand-paths';

export const BRAND = {
  teal: '#0F766E',      // primary — letters, buttons, app-icon background
  tealDark: '#115E59',  // text on teal tints
  navy: '#1E293B',      // text / dark backgrounds
  amber: '#F59E0B',     // the sparkle (star above the "i") — ALWAYS amber
  paper: '#F8FAFC',     // page background / white letters on dark
} as const;

/** The "Getit" wordmark. Letters follow currentColor (teal on light, near-white on dark). Sparkle is always amber. */
export function Wordmark({ className = '', title = 'Getit' }: { className?: string; title?: string }) {
  return <svg viewBox={WORDMARK.viewBox} className={'text-[#0F766E] dark:text-[#F8FAFC] ' + className} role="img" aria-label={title}>
    <path d={WORDMARK.letters} fill="currentColor" />
    <path d={WORDMARK.sparkle} fill={BRAND.amber} />
  </svg>;
}

/** The app icon: "Gi" + sparkle on a rounded teal square. */
export function LogoMark({ className = '', title }: { className?: string; title?: string }) {
  return <svg viewBox="0 0 512 512" className={className} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
    <rect width="512" height="512" rx="112" fill={BRAND.teal} />
    <path d={MARK.letters} transform={MARK.lettersTransform ?? undefined} fill={BRAND.paper} />
    <path d={MARK.sparkle} fill={BRAND.amber} />
  </svg>;
}

/** The four-point sparkle on a 24×24 grid. Used as the loading sign and as the "AI" marker. */
export const SPARKLE_PATH = 'M12 1C12.9 8 16 11.1 23 12C16 12.9 12.9 16 12 23C11.1 16 8 12.9 1 12C8 11.1 11.1 8 12 1Z';
const DIAMOND_PATH = 'M12 3.2C14.93 6.13 17.87 9.07 20.8 12C17.87 14.93 14.93 17.87 12 20.8C9.07 17.87 6.13 14.93 3.2 12C6.13 9.07 9.07 6.13 12 3.2Z';
const EASE = '0.45 0 0.25 1';

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** Loading sign: the sparkle morphs into a diamond and back while turning a quarter. Use this instead of a generic spinner. */
export function Spinner({ className = '', label = 'Loading…', decorative = false }: { className?: string; label?: string; decorative?: boolean }) {
  const reduced = useReducedMotion();
  return <svg viewBox="0 0 24 24" className={'inline-block size-[1.15em] shrink-0 ' + className} {...(decorative ? { 'aria-hidden': true } : { role: 'status', 'aria-label': label })}>
    <path d={SPARKLE_PATH} fill={BRAND.amber}>
      {!reduced && <>
        <animate attributeName="d" dur="1.3s" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines={`${EASE};${EASE}`} values={`${SPARKLE_PATH};${DIAMOND_PATH};${SPARKLE_PATH}`} />
        <animateTransform attributeName="transform" type="rotate" dur="1.3s" repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines={EASE} values="0 12 12;90 12 12" />
      </>}
    </path>
  </svg>;
}

/** Full-area loading state. */
export function LoadingState({ text = 'Loading…' }: { text?: string }) {
  return <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center text-muted-foreground" aria-busy="true">
    <Spinner decorative className="!size-12" />
    <p role="status" className="text-sm">{text}</p>
  </div>;
}

import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { LogoMark } from '@/components/brand/brand';
import { ThemeToggle } from './ThemeToggle';

/** Instructor top bar (shots 02/09): app icon left, page extras, theme toggle + menu right. */
export function AppHeader({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <header className="border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link to="/dashboard" aria-label="Getit dashboard" className="rounded-lg">
          <LogoMark className="size-10" />
        </Link>
        {left}
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          {right}
        </div>
      </div>
    </header>
  );
}

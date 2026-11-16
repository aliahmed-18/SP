import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Wordmark } from '@/components/brand/brand';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link to="/" aria-label="Getit home" className="rounded-md">
          <Wordmark className="h-9 w-auto" />
        </Link>
        <ThemeToggle />
      </header>
      <main className="mx-auto w-full max-w-md px-4 pt-6 pb-16">
        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="mb-6 text-muted-foreground">{subtitle}</p>
          {children}
        </div>
      </main>
    </div>
  );
}

import { RotateCw } from 'lucide-react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { Wordmark } from '@/components/brand/brand';
import { Button } from '@/components/ui/button';

/**
 * Last line of defence: any screen that throws while rendering lands here instead of a blank page.
 * Reloading is always safe: every screen rebuilds itself from a fresh server snapshot (rule 7).
 */
export function RouteError() {
  const error = useRouteError();
  // A new deploy can remove old lazy chunks; a reload fetches the new ones.
  const chunk =
    error instanceof Error &&
    /dynamically imported module|Importing a module script failed/i.test(error.message);
  if (!isRouteErrorResponse(error)) console.error('[getit] screen crashed', error);
  return (
    <main
      className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 p-6 text-center"
      role="alert"
    >
      <Wordmark className="h-10 w-auto" />
      <h1 className="text-2xl font-semibold">{chunk ? 'Getit was updated' : 'Something went wrong'}</h1>
      <p className="text-muted-foreground">
        {chunk
          ? 'Reload to get the latest version.'
          : 'Reload the page — you will come back to where you were.'}
      </p>
      <div className="flex gap-2">
        <Button onClick={() => window.location.reload()}>
          <RotateCw /> Reload
        </Button>
        <Button asChild variant="outline">
          <Link to="/" reloadDocument>
            Home
          </Link>
        </Button>
      </div>
    </main>
  );
}

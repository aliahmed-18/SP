import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';
import { Wordmark } from '@/components/brand/brand';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
      <Wordmark className="h-10 w-auto" />
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground">The link may be wrong or the page has moved.</p>
      <Button asChild variant="outline">
        <Link to="/">
          <ArrowLeft /> Back to home
        </Link>
      </Button>
    </main>
  );
}

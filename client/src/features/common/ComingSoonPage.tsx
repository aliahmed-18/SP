import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';
import { Wordmark } from '@/components/brand/brand';
import { Button } from '@/components/ui/button';

/** Phase 1 placeholder for routes that are built in Phase 2. */
export function ComingSoonPage({ title }: { title: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
      <Wordmark className="h-10 w-auto" />
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground">This screen is being built. Check back soon.</p>
      <Button asChild variant="outline">
        <Link to="/">
          <ArrowLeft /> Back to home
        </Link>
      </Button>
    </main>
  );
}

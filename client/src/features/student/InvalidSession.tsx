import { Link } from 'react-router';
import { INVALID_CODE_MESSAGE } from '@getit/shared';
import { Wordmark } from '@/components/brand/brand';
import { JoinCard } from '@/features/home/JoinCard';

/** Wrong / expired code: say so, and let the student type it again right here. */
export function InvalidSession({ code }: { code: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-6">
      <Link to="/" aria-label="Getit home" className="w-fit rounded-md">
        <Wordmark className="h-9 w-auto" />
      </Link>
      <JoinCard key={code} initialCode={code} initialError={INVALID_CODE_MESSAGE} />
    </main>
  );
}

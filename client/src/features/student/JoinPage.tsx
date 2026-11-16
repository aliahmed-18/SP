import { useQuery } from '@tanstack/react-query';
import { Navigate, useParams } from 'react-router';
import { isValidJoinCode, normalizeJoinCode, type PublicSessionInfo } from '@getit/shared';
import { LoadingState } from '@/components/brand/brand';
import { ErrorState } from '@/components/layout/ErrorState';
import { Button } from '@/components/ui/button';
import { api, ApiRequestError } from '@/lib/api';
import { InvalidSession } from './InvalidSession';

/** `/join/:code` — what the QR opens. Checks the code, then goes to the student page. */
export function JoinPage() {
  const code = normalizeJoinCode(useParams().code ?? '');
  const valid = isValidJoinCode(code);
  const info = useQuery({
    queryKey: ['public-session', code],
    queryFn: () => api<PublicSessionInfo>(`/public/sessions/${code}`),
    enabled: valid,
    retry: (count, err) => !(err instanceof ApiRequestError && err.status === 404) && count < 2,
  });

  if (!valid) return <InvalidSession code={code} />;
  if (info.isPending) return <LoadingState text="Finding your lecture…" />;
  if (info.isError) {
    if (info.error instanceof ApiRequestError && info.error.status === 404)
      return <InvalidSession code={code} />;
    return (
      <ErrorState
        title="Can't reach Getit"
        body="Check your internet connection and try again."
        action={<Button onClick={() => void info.refetch()}>Retry</Button>}
      />
    );
  }
  return <Navigate to={`/s/${code}`} replace />;
}

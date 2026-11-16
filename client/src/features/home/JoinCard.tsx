import { useState, type FormEvent } from 'react';
import { LogIn } from 'lucide-react';
import { useNavigate } from 'react-router';
import { CODE_LENGTH, INVALID_CODE_MESSAGE, isValidJoinCode, normalizeJoinCode } from '@getit/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function JoinCard({
  initialCode = '',
  initialError = null,
}: {
  initialCode?: string;
  initialError?: string | null;
}) {
  const navigate = useNavigate();
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState<string | null>(initialError);
  const valid = isValidJoinCode(code);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid) {
      setError(INVALID_CODE_MESSAGE);
      return;
    }
    navigate(`/join/${code}`, { replace: initialError !== null });
  }

  return (
    <section aria-labelledby="join-title" className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="mb-3 flex items-center gap-3 text-sm text-muted-foreground">
        <span className="grid size-9 place-items-center rounded-lg bg-accent text-primary">
          <LogIn className="size-5" aria-hidden />
        </span>
        For students
      </div>
      <h2 id="join-title" className="text-xl font-semibold">
        Join a lecture
      </h2>
      <p className="mb-5 text-muted-foreground">Enter the 5-letter code on the screen.</p>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
        <Label htmlFor="join-code">Session code</Label>
        <Input
          id="join-code"
          value={code}
          onChange={(e) => {
            setCode(normalizeJoinCode(e.target.value).slice(0, CODE_LENGTH));
            setError(null);
          }}
          placeholder="•••••"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'join-error' : undefined}
          className="h-16 text-center font-semibold tracking-[0.5em] uppercase md:text-3xl text-3xl"
        />
        {error && (
          <p id="join-error" role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" disabled={!valid}>
          Join
        </Button>
      </form>
    </section>
  );
}

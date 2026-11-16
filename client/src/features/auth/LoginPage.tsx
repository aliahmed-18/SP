import { type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { loginSchema } from '@getit/shared';
import { LoadingState, Spinner } from '@/components/brand/brand';
import { Button } from '@/components/ui/button';
import { AuthLayout } from './AuthLayout';
import { FormField } from './FormField';
import { useAuthForm } from './use-auth-form';
import { useMe } from './use-me';

export function LoginPage() {
  const me = useMe();
  const [params] = useSearchParams();
  const { submit, fieldErrors, formError, submitting } = useAuthForm(loginSchema, '/auth/login');

  if (me.isPending) return <LoadingState />;
  if (me.data) return <Navigate to="/dashboard" replace />;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void submit({ email: f.get('email'), password: f.get('password') });
  }

  return (
    <AuthLayout title="Log in" subtitle="Welcome back. Run your lecture with Getit.">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormField
          id="email"
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          error={fieldErrors.email}
        />
        <FormField
          id="password"
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          error={fieldErrors.password}
        />
        {formError && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </p>
        )}
        <Button type="submit" size="lg" disabled={submitting}>
          {submitting && <Spinner decorative />} Log in
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New to Getit?{' '}
        <Link
          to={`/register${params.size ? `?${params}` : ''}`}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}

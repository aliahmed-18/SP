import { type FormEvent } from 'react';
import { Link, Navigate } from 'react-router';
import { LIMITS, registerSchema } from '@getit/shared';
import { LoadingState, Spinner } from '@/components/brand/brand';
import { Button } from '@/components/ui/button';
import { AuthLayout } from './AuthLayout';
import { FormField } from './FormField';
import { useAuthForm } from './use-auth-form';
import { useMe } from './use-me';

export function RegisterPage() {
  const me = useMe();
  const { submit, fieldErrors, formError, submitting } = useAuthForm(registerSchema, '/auth/register');

  if (me.isPending) return <LoadingState />;
  if (me.data) return <Navigate to="/dashboard" replace />;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void submit({ name: f.get('name'), email: f.get('email'), password: f.get('password') });
  }

  return (
    <AuthLayout title="Create account" subtitle="For instructors. Students never need an account.">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormField
          id="name"
          name="name"
          label="Name"
          autoComplete="name"
          placeholder="e.g. Dr. Sara Ali"
          maxLength={LIMITS.nameMax}
          error={fieldErrors.name}
        />
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
          autoComplete="new-password"
          placeholder={`At least ${LIMITS.passwordMin} characters`}
          error={fieldErrors.password}
        />
        {formError && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </p>
        )}
        <Button type="submit" size="lg" disabled={submitting}>
          {submitting && <Spinner decorative />} Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}

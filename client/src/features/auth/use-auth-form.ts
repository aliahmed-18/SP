import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router';
import type { z } from 'zod';
import type { Me } from '@getit/shared';
import { api, ApiRequestError } from '@/lib/api';
import { meQueryKey } from './use-me';

type FieldErrors = Partial<Record<string, string>>;

/** Shared submit logic for login/register: zod-validate on the client, post, store `me`, go to `next`. */
export function useAuthForm<S extends z.ZodType>(schema: S, path: '/auth/login' | '/auth/register') {
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  async function submit(values: unknown) {
    setFormError(null);
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const errs: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        errs[key] ??= issue.message;
      }
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      const me = await api<Me>(path, { method: 'POST', body: JSON.stringify(parsed.data) });
      queryClient.setQueryData(meQueryKey, me);
      const next = params.get('next');
      navigate(next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard', {
        replace: true,
      });
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return { submit, fieldErrors, formError, submitting };
}

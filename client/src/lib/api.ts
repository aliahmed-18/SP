import type { ApiError } from '@getit/shared';

/** Error thrown by `api()` with the server's `{ error: { code, message } }`. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Fetch JSON from `/api` (same origin; the auth cookie is sent automatically). */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      ...init,
      headers: { 'content-type': 'application/json', ...init.headers },
    });
  } catch {
    throw new ApiRequestError(0, 'NETWORK', 'No connection. Check your internet and try again.');
  }
  const body: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = (body as ApiError | null)?.error;
    throw new ApiRequestError(res.status, err?.code ?? 'HTTP_ERROR', err?.message ?? 'Something went wrong.');
  }
  return body as T;
}

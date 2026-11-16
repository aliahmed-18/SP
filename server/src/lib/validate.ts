import type { z } from 'zod';
import { HttpError } from './errors';

/** Parse with a shared zod schema; on failure throw a 400 with the first readable message. */
export function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(400, 'VALIDATION', result.error.issues[0]?.message ?? 'Invalid input.');
  }
  return result.data;
}

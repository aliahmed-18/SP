import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { env } from '../env';

/** Written by `npm run share` (a Cloudflare quick tunnel), removed when it stops. Never committed. */
export const PUBLIC_URL_FILE = fileURLToPath(new URL('../../../.getit-public-url', import.meta.url));

/**
 * The address phones should open (QR + "go to …" on the projector) when the app runs on a laptop:
 * PUBLIC_URL from the environment, else the tunnel address `npm run share` saved, else null (the page
 * then uses its own address). Only a plain https origin is accepted.
 */
export function publicUrl(): string | null {
  const raw = env.PUBLIC_URL || (existsSync(PUBLIC_URL_FILE) ? readFileSync(PUBLIC_URL_FILE, 'utf8') : '');
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
}

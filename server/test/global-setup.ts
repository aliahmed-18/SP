import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Bring the test database to the latest migration before any test runs. */
export default function setup() {
  const script = fileURLToPath(new URL('../scripts/prisma.mjs', import.meta.url));
  try {
    execFileSync(process.execPath, [script, 'migrate', 'deploy'], {
      stdio: 'pipe',
      env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
    });
  } catch (err) {
    const stderr = (err as { stderr?: Buffer }).stderr?.toString() ?? '';
    throw new Error(`Could not migrate the test database (is Postgres running?)\n${stderr.trim()}`, {
      cause: err,
    });
  }
}

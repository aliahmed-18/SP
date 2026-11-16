import bcrypt from 'bcryptjs';
import type { LoginInput, Me, RegisterInput } from '@getit/shared';
import { prisma } from '../db';
import { HttpError } from '../lib/errors';

const BCRYPT_COST = 10;
// Compared against when the email doesn't exist, so both failures take the same time.
const DUMMY_HASH = bcrypt.hashSync('getit-timing-equaliser', BCRYPT_COST);
const BAD_LOGIN = new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');

const toMe = (i: { id: string; name: string; email: string }): Me => ({
  id: i.id,
  name: i.name,
  email: i.email,
});

export async function register(input: RegisterInput): Promise<Me> {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  try {
    const created = await prisma.instructor.create({
      data: { name: input.name, email: input.email, passwordHash },
    });
    return toMe(created);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new HttpError(409, 'EMAIL_TAKEN', 'An account with this email already exists. Log in instead.');
    }
    throw err;
  }
}

export async function login(input: LoginInput): Promise<Me> {
  const found = await prisma.instructor.findUnique({ where: { email: input.email } });
  const ok = await bcrypt.compare(input.password, found?.passwordHash ?? DUMMY_HASH);
  if (!found || !ok) throw BAD_LOGIN;
  return toMe(found);
}

export async function getMe(id: string): Promise<Me> {
  const found = await prisma.instructor.findUnique({ where: { id } });
  if (!found) throw new HttpError(401, 'UNAUTHENTICATED', 'Please log in.');
  return toMe(found);
}

export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';
}

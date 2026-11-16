import { describe, expect, it } from 'vitest';
import { createSessionSchema, joinCodeSchema, registerSchema, socketAuthSchema } from './schemas';

describe('shared schemas', () => {
  it('joinCodeSchema normalises and validates', () => {
    expect(joinCodeSchema.parse(' bc eu-3 ')).toBe('BCEU3');
    expect(joinCodeSchema.safeParse('BCEO3').success).toBe(false);
    expect(joinCodeSchema.safeParse('').success).toBe(false);
  });
  it('registerSchema enforces password ≥ 8 and normalises email', () => {
    expect(registerSchema.safeParse({ name: 'A', email: 'a@b.co', password: '1234567' }).success).toBe(false);
    const ok = registerSchema.parse({ name: ' Dr. A ', email: ' A@B.Co ', password: '12345678' });
    expect(ok).toEqual({ name: 'Dr. A', email: 'a@b.co', password: '12345678' });
  });
  it('createSessionSchema: topic 1–80, academic mode defaults ON', () => {
    expect(createSessionSchema.parse({ topic: 'Regression' }).academicMode).toBe(true);
    expect(createSessionSchema.safeParse({ topic: '   ' }).success).toBe(false);
    expect(createSessionSchema.safeParse({ topic: 'x'.repeat(81) }).success).toBe(false);
    expect(createSessionSchema.safeParse({ topic: 'x'.repeat(80) }).success).toBe(true);
  });
  it('socketAuthSchema requires a uuid deviceId for students and a token for host', () => {
    expect(socketAuthSchema.safeParse({ role: 'student', code: 'BCEU3', deviceId: 'nope' }).success).toBe(
      false,
    );
    expect(
      socketAuthSchema.safeParse({
        role: 'student',
        code: 'BCEU3',
        deviceId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      }).success,
    ).toBe(true);
    expect(socketAuthSchema.safeParse({ role: 'host', code: 'BCEU3' }).success).toBe(false);
    expect(socketAuthSchema.safeParse({ role: 'admin', code: 'BCEU3', token: 'x' }).success).toBe(false);
  });
});

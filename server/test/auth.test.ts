import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { app, newInstructor, resetDb } from './helpers';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe('auth', () => {
  it('register sets an httpOnly cookie and /me works', async () => {
    const agent = request.agent(app);
    const res = await agent
      .post('/api/auth/register')
      .send({ name: 'Dr. A', email: 'A@Example.com', password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: expect.any(String), name: 'Dr. A', email: 'a@example.com' });
    const cookie = res.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toMatch(/^getit_token=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(res.body).not.toHaveProperty('passwordHash');

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.email).toBe('a@example.com');
  });

  it('stores a bcrypt hash, never the password', async () => {
    const { email } = await newInstructor();
    const row = await prisma.instructor.findUniqueOrThrow({ where: { email } });
    expect(row.passwordHash).toMatch(/^\$2[aby]\$10\$/);
    expect(row.passwordHash).not.toContain('password123');
  });

  it('validates input with the shared schema', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'A', email: 'a@b.co', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({
      code: 'VALIDATION',
      message: 'Password must be at least 8 characters.',
    });
  });

  it('rejects a duplicate email', async () => {
    const { email } = await newInstructor();
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'B', email, password: 'password123' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('login: same error for wrong email and wrong password', async () => {
    const { email } = await newInstructor();
    const wrongPw = await request(app).post('/api/auth/login').send({ email, password: 'nope-nope' });
    const wrongEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' });
    expect(wrongPw.status).toBe(401);
    expect(wrongEmail.status).toBe(401);
    expect(wrongPw.body).toEqual(wrongEmail.body);
    const ok = await request(app)
      .post('/api/auth/login')
      .send({ email: email.toUpperCase(), password: 'password123' });
    expect(ok.status).toBe(200);
  });

  it('logout clears the cookie', async () => {
    const { agent } = await newInstructor();
    expect((await agent.post('/api/auth/logout')).status).toBe(204);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('protected routes need the cookie; a socket token is not a session cookie', async () => {
    expect((await request(app).get('/api/courses')).status).toBe(401);
    const { agent } = await newInstructor();
    const { token } = (await agent.get('/api/auth/socket-token')).body as { token: string };
    const res = await request(app).get('/api/courses').set('Cookie', `getit_token=${token}`);
    expect(res.status).toBe(401);
  });

  it('rate-limits repeated logins', async () => {
    const { email } = await newInstructor();
    let last = 0;
    for (let i = 0; i < 21; i++) {
      last = (await request(app).post('/api/auth/login').send({ email, password: 'wrong-wrong' })).status;
    }
    expect(last).toBe(429);
  });
});

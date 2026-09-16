import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { uniqueEmail, cleanupTestUsers } from '../test-helpers';

const emails: string[] = [];
function testEmail(prefix: string) {
  const email = uniqueEmail(prefix);
  emails.push(email);
  return email;
}

afterAll(() => cleanupTestUsers(emails));

describe('POST /auth/register', () => {
  it('crea un usuario y devuelve token + user', async () => {
    const email = testEmail('register-ok');
    const res = await request(app).post('/auth/register').send({ email, password: 'secret123' });

    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toEqual({ id: expect.any(String), email });
  });

  it('rechaza un email duplicado con 409', async () => {
    const email = testEmail('register-dup');
    await request(app).post('/auth/register').send({ email, password: 'secret123' });

    const res = await request(app).post('/auth/register').send({ email, password: 'otra-pass' });

    expect(res.status).toBe(409);
  });

  it('rechaza campos faltantes con 400', async () => {
    const res = await request(app).post('/auth/register').send({ email: testEmail('register-missing') });
    expect(res.status).toBe(400);
  });

  it('rechaza una contraseña corta con 400', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: testEmail('register-short'), password: '123' });
    expect(res.status).toBe(400);
  });

  it('no guarda la contraseña en texto plano', async () => {
    const email = testEmail('register-hash');
    await request(app).post('/auth/register').send({ email, password: 'secret123' });

    const { prisma } = await import('../lib/prisma');
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user?.password).not.toBe('secret123');
  });
});

describe('POST /auth/login', () => {
  it('devuelve token con credenciales correctas', async () => {
    const email = testEmail('login-ok');
    await request(app).post('/auth/register').send({ email, password: 'secret123' });

    const res = await request(app).post('/auth/login').send({ email, password: 'secret123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
  });

  it('rechaza una contraseña incorrecta con 401', async () => {
    const email = testEmail('login-wrongpass');
    await request(app).post('/auth/register').send({ email, password: 'secret123' });

    const res = await request(app).post('/auth/login').send({ email, password: 'incorrecta' });

    expect(res.status).toBe(401);
  });

  it('rechaza un email que no existe con 401', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: testEmail('login-nouser'), password: 'lo-que-sea' });

    expect(res.status).toBe(401);
  });
});

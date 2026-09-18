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
    expect(res.body.user).toEqual({ id: expect.any(String), email, name: null });
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

describe('GET /auth/me', () => {
  it('rechaza sin token con 401', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('devuelve el perfil del usuario autenticado', async () => {
    const email = testEmail('me-ok');
    const registered = await request(app).post('/auth/register').send({ email, password: 'secret123' });

    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${registered.body.token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: registered.body.user.id, email, name: null, createdAt: expect.any(String) });
  });
});

describe('PUT /auth/me', () => {
  it('actualiza el nombre', async () => {
    const email = testEmail('me-update');
    const registered = await request(app).post('/auth/register').send({ email, password: 'secret123' });

    const res = await request(app)
      .put('/auth/me')
      .set('Authorization', `Bearer ${registered.body.token}`)
      .send({ name: 'Ana Ramírez' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Ana Ramírez');
  });
});

describe('PUT /auth/password', () => {
  it('rechaza si la contraseña actual no coincide', async () => {
    const email = testEmail('pw-wrong');
    const registered = await request(app).post('/auth/register').send({ email, password: 'secret123' });

    const res = await request(app)
      .put('/auth/password')
      .set('Authorization', `Bearer ${registered.body.token}`)
      .send({ currentPassword: 'no-es-esta', newPassword: 'nuevapass123' });

    expect(res.status).toBe(401);
  });

  it('cambia la contraseña y permite loguear con la nueva', async () => {
    const email = testEmail('pw-ok');
    const registered = await request(app).post('/auth/register').send({ email, password: 'secret123' });

    const changed = await request(app)
      .put('/auth/password')
      .set('Authorization', `Bearer ${registered.body.token}`)
      .send({ currentPassword: 'secret123', newPassword: 'nuevapass123' });
    expect(changed.status).toBe(204);

    const loginOld = await request(app).post('/auth/login').send({ email, password: 'secret123' });
    expect(loginOld.status).toBe(401);

    const loginNew = await request(app).post('/auth/login').send({ email, password: 'nuevapass123' });
    expect(loginNew.status).toBe(200);
  });
});

describe('DELETE /auth/me', () => {
  it('rechaza si la contraseña no coincide', async () => {
    const email = testEmail('delete-wrong');
    const registered = await request(app).post('/auth/register').send({ email, password: 'secret123' });

    const res = await request(app)
      .delete('/auth/me')
      .set('Authorization', `Bearer ${registered.body.token}`)
      .send({ password: 'no-es-esta' });

    expect(res.status).toBe(401);
  });

  it('borra la cuenta y sus postulaciones, y deja de poder loguearse', async () => {
    const email = testEmail('delete-ok');
    const registered = await request(app).post('/auth/register').send({ email, password: 'secret123' });
    const token = registered.body.token;

    await request(app).post('/applications').set('Authorization', `Bearer ${token}`).send({ company: 'X', role: 'Y' });

    const res = await request(app).delete('/auth/me').set('Authorization', `Bearer ${token}`).send({ password: 'secret123' });
    expect(res.status).toBe(204);

    const login = await request(app).post('/auth/login').send({ email, password: 'secret123' });
    expect(login.status).toBe(401);
  });
});

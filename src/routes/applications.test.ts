import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { uniqueEmail, cleanupTestUsers } from '../test-helpers';

const emails: string[] = [];
function testEmail(prefix: string) {
  const email = uniqueEmail(prefix);
  emails.push(email);
  return email;
}

let tokenA: string;
let tokenB: string;

beforeAll(async () => {
  const emailA = testEmail('apps-userA');
  const emailB = testEmail('apps-userB');
  const resA = await request(app).post('/auth/register').send({ email: emailA, password: 'secret123' });
  const resB = await request(app).post('/auth/register').send({ email: emailB, password: 'secret123' });
  tokenA = resA.body.token;
  tokenB = resB.body.token;
});

afterAll(() => cleanupTestUsers(emails));

describe('GET /applications', () => {
  it('rechaza sin token con 401', async () => {
    const res = await request(app).get('/applications');
    expect(res.status).toBe(401);
  });

  it('devuelve solo las postulaciones del usuario autenticado', async () => {
    await request(app)
      .post('/applications')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ company: 'Acme', role: 'Dev' });

    const res = await request(app).get('/applications').set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.every((a: { company: string }) => a.company === 'Acme')).toBe(true);
  });
});

describe('POST /applications', () => {
  it('crea con status por defecto POR_APLICAR', async () => {
    const res = await request(app)
      .post('/applications')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ company: 'Globex', role: 'QA' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('POR_APLICAR');
  });

  it('rechaza company/role faltantes con 400', async () => {
    const res = await request(app)
      .post('/applications')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ company: 'Solo empresa' });

    expect(res.status).toBe(400);
  });

  it('rechaza un status inválido con 400', async () => {
    const res = await request(app)
      .post('/applications')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ company: 'X', role: 'Y', status: 'NO_EXISTE' });

    expect(res.status).toBe(400);
  });
});

describe('aislamiento entre usuarios', () => {
  it('el usuario B no puede ver una postulación del usuario A (404, no 200 ni 403)', async () => {
    const created = await request(app)
      .post('/applications')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ company: 'Privado de A', role: 'Dev' });

    const res = await request(app)
      .get(`/applications/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
  });

  it('el usuario B no puede editar una postulación del usuario A', async () => {
    const created = await request(app)
      .post('/applications')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ company: 'Otra de A', role: 'Dev' });

    const res = await request(app)
      .put(`/applications/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ company: 'Hackeado' });

    expect(res.status).toBe(404);

    const stillA = await request(app)
      .get(`/applications/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(stillA.body.company).toBe('Otra de A');
  });

  it('el usuario B no puede borrar una postulación del usuario A', async () => {
    const created = await request(app)
      .post('/applications')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ company: 'Intocable de A', role: 'Dev' });

    const del = await request(app)
      .delete(`/applications/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(del.status).toBe(404);

    const stillThere = await request(app)
      .get(`/applications/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(stillThere.status).toBe(200);
  });
});

describe('PUT /applications/:id', () => {
  it('actualiza los campos enviados', async () => {
    const created = await request(app)
      .post('/applications')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ company: 'OldCo', role: 'Old Role' });

    const res = await request(app)
      .put(`/applications/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ company: 'NewCo', status: 'ENTREVISTA' });

    expect(res.status).toBe(200);
    expect(res.body.company).toBe('NewCo');
    expect(res.body.status).toBe('ENTREVISTA');
    expect(res.body.role).toBe('Old Role');
  });

  it('devuelve 404 para un id inexistente', async () => {
    const res = await request(app)
      .put('/applications/no-existe-este-id')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ company: 'X' });
    expect(res.status).toBe(404);
  });
});

describe('GET /applications/status-history', () => {
  it('registra la creación y cada cambio de estado', async () => {
    const created = await request(app)
      .post('/applications')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ company: 'HistoryCo', role: 'Dev' });

    await request(app)
      .put(`/applications/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ status: 'APLICADO' });

    const res = await request(app).get('/applications/status-history').set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);

    const entries = res.body.filter((c: { applicationId: string }) => c.applicationId === created.body.id);
    expect(entries).toEqual([
      expect.objectContaining({ fromStatus: null, toStatus: 'POR_APLICAR' }),
      expect.objectContaining({ fromStatus: 'POR_APLICAR', toStatus: 'APLICADO' }),
    ]);
  });

  it('no incluye una nueva entrada si el PUT no cambia el status', async () => {
    const created = await request(app)
      .post('/applications')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ company: 'NoChangeCo', role: 'Dev' });

    await request(app)
      .put(`/applications/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ company: 'NoChangeCo Renombrada' });

    const res = await request(app).get('/applications/status-history').set('Authorization', `Bearer ${tokenA}`);
    const entries = res.body.filter((c: { applicationId: string }) => c.applicationId === created.body.id);
    expect(entries).toHaveLength(1);
  });

  it('rechaza sin token con 401', async () => {
    const res = await request(app).get('/applications/status-history');
    expect(res.status).toBe(401);
  });
});

describe('DELETE /applications/:id', () => {
  it('borra y después devuelve 404 al buscarla', async () => {
    const created = await request(app)
      .post('/applications')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ company: 'Para borrar', role: 'Dev' });

    const del = await request(app)
      .delete(`/applications/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(del.status).toBe(204);

    const after = await request(app)
      .get(`/applications/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(after.status).toBe(404);
  });
});

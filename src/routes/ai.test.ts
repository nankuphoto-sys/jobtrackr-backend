import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { app } from '../app';
import { uniqueEmail, cleanupTestUsers } from '../test-helpers';

// Ollama simulado: se reemplaza `fetch` (supertest no lo usa, va por http).
// Así los tests no necesitan Ollama corriendo (en CI no lo hay).
const OFERTA = 'Rappi busca Frontend Developer remoto en Bogotá. Stack: React, TypeScript. Salario $8.000.000 COP mensuales. Aplica en https://rappi.com/careers/123';
const respuestaValida = {
  company: 'Rappi',
  role: 'Frontend Developer',
  location: 'Bogotá',
  modality: 'remote',
  seniority: 'unknown',
  salary: { min: 8000000, max: null, currency: 'COP', period: 'month' },
  stack: ['React', 'TypeScript'],
  requirements: [],
  language: null,
  applyUrl: 'https://rappi.com/careers/123',
  deadline: null,
  summary: 'Rappi busca un desarrollador frontend remoto.',
};

function ollamaResponde(...contenidos: string[]) {
  const fetchFalso = vi.fn();
  for (const c of contenidos) {
    fetchFalso.mockResolvedValueOnce(new Response(JSON.stringify({ message: { content: c } }), { status: 200 }));
  }
  vi.stubGlobal('fetch', fetchFalso);
  return fetchFalso;
}

const emails: string[] = [];
let token: string;

beforeAll(async () => {
  const email = uniqueEmail('ai-extract');
  emails.push(email);
  const res = await request(app).post('/auth/register').send({ email, password: 'secret123' });
  token = res.body.token;
});
afterEach(() => {
  vi.unstubAllGlobals();
  process.env.AI_EXTRACTOR_ENABLED = 'true';
});
afterAll(() => cleanupTestUsers(emails));

process.env.AI_EXTRACTOR_ENABLED = 'true';
const extraer = (text: unknown) => request(app).post('/ai/extract-job').set('Authorization', `Bearer ${token}`).send({ text });

describe('POST /ai/extract-job', () => {
  it('pide login', async () => {
    const res = await request(app).post('/ai/extract-job').send({ text: OFERTA });
    expect(res.status).toBe(401);
  });

  it('extrae la oferta y llama a Ollama con salida estructurada y temperatura 0', async () => {
    const fetchFalso = ollamaResponde(JSON.stringify(respuestaValida));
    const res = await extraer(OFERTA);
    expect(res.status).toBe(200);
    expect(res.body.oferta).toEqual(respuestaValida);
    expect(res.body.intentos).toBe(1);
    expect(res.body.descartados).toEqual([]);

    const [url, init] = fetchFalso.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/chat$/);
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ stream: false, think: false, options: { temperature: 0 } });
    expect(body.format.required).toContain('summary');
  });

  it('descarta una empresa que no aparece en el texto (inventada por el modelo)', async () => {
    ollamaResponde(JSON.stringify({ ...respuestaValida, company: 'Globant' }));
    const res = await extraer(OFERTA);
    expect(res.status).toBe(200);
    expect(res.body.oferta.company).toBeNull();
    expect(res.body.descartados).toContain('company');
  });

  it('reintenta una vez si la primera respuesta no cumple el esquema', async () => {
    const fetchFalso = ollamaResponde('esto no es json', JSON.stringify(respuestaValida));
    const res = await extraer(OFERTA);
    expect(res.status).toBe(200);
    expect(res.body.intentos).toBe(2);
    expect(fetchFalso).toHaveBeenCalledTimes(2);
  });

  it('responde 422 si falla dos veces la validación', async () => {
    ollamaResponde(JSON.stringify({ role: 'x' }), JSON.stringify({ ...respuestaValida, modality: 'presencial' }));
    const res = await extraer(OFERTA);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/no cumplen el formato/);
  });

  it('responde 503 con el mensaje de la spec si Ollama no responde', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const res = await extraer(OFERTA);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('El modelo local no está disponible. ¿Está abierto Ollama?');
  });

  it('responde 503 indicando el comando si falta descargar el modelo', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"model not found"}', { status: 404 })));
    const res = await extraer(OFERTA);
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/ollama pull/);
  });

  it('responde 503 si el extractor está desactivado (producción)', async () => {
    process.env.AI_EXTRACTOR_ENABLED = 'false';
    const fetchFalso = ollamaResponde(JSON.stringify(respuestaValida));
    const res = await extraer(OFERTA);
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/desactivado/);
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it('valida el texto: vacío o de más de 15.000 caracteres → 400', async () => {
    expect((await extraer('   ')).status).toBe(400);
    expect((await extraer('a'.repeat(15001))).status).toBe(400);
    expect((await extraer(123)).status).toBe(400);
  });
});

describe('GET /ai/status', () => {
  it('informa si el extractor está habilitado y si Ollama responde', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"models":[]}', { status: 200 })));
    const res = await request(app).get('/ai/status').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ habilitado: true, disponible: true });
  });
});

describe('GET /ai/perfil', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jobtrackr-perfil-'));
  const pedir = () => request(app).get('/ai/perfil').set('Authorization', `Bearer ${token}`);
  afterEach(() => { delete process.env.PROFILE_PATH; });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('pide login', async () => {
    expect((await request(app).get('/ai/perfil')).status).toBe(401);
  });

  it('devuelve perfil null si no hay profile.json (producción)', async () => {
    process.env.PROFILE_PATH = join(dir, 'no-existe.json');
    const res = await pedir();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ perfil: null });
  });

  it('devuelve el perfil validado', async () => {
    const perfil = { stack: ['React', 'Node.js'], modality: ['remote'], seniority: 'junior' };
    process.env.PROFILE_PATH = join(dir, 'ok.json');
    writeFileSync(process.env.PROFILE_PATH, JSON.stringify(perfil));
    const res = await pedir();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ perfil });
  });

  it('responde 500 con un mensaje claro si profile.json está mal escrito', async () => {
    process.env.PROFILE_PATH = join(dir, 'roto.json');
    writeFileSync(process.env.PROFILE_PATH, '{ "stack": [');
    expect((await pedir()).body.error).toMatch(/no es JSON válido/);

    writeFileSync(process.env.PROFILE_PATH, JSON.stringify({ stack: ['React'], modality: ['remoto'], seniority: 'junior' }));
    const res = await pedir();
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/modality/);
  });
});

describe('POST /applications con los campos de la oferta', () => {
  it('guarda los campos nuevos y rechaza valores inválidos', async () => {
    const ok = await request(app)
      .post('/applications')
      .set('Authorization', `Bearer ${token}`)
      .send({
        company: 'Rappi', role: 'Frontend', location: 'Bogotá', modality: 'remote', seniority: 'mid',
        salaryMin: 8000000, salaryCurrency: 'COP', salaryPeriod: 'month', stack: ['React'], deadline: '2026-10-30',
        summary: 'Rol remoto.',
      });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ modality: 'remote', seniority: 'mid', salaryMin: 8000000, stack: ['React'] });
    expect(ok.body.deadline).toMatch(/^2026-10-30/);

    const malo = await request(app)
      .post('/applications')
      .set('Authorization', `Bearer ${token}`)
      .send({ company: 'X', role: 'Y', modality: 'presencial' });
    expect(malo.status).toBe(400);
    expect(malo.body.error).toMatch(/modality/);

    const fechaImposible = await request(app)
      .post('/applications')
      .set('Authorization', `Bearer ${token}`)
      .send({ company: 'X', role: 'Y', deadline: '2026-13-45' });
    expect(fechaImposible.status).toBe(400);
    expect(fechaImposible.body.error).toMatch(/deadline/);
  });
});

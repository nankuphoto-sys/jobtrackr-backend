import { describe, it, expect } from 'vitest';
import { verificarContraTexto, ofertaSchema, type Oferta } from './extraerOferta';

const base: Oferta = {
  company: 'Rappi',
  role: 'Frontend Developer',
  location: 'Bogotá',
  modality: 'remote',
  seniority: 'mid',
  salary: { min: 8000000, max: 10000000, currency: 'COP', period: 'month' },
  stack: ['React'],
  requirements: [],
  language: null,
  applyUrl: 'https://rappi.com/careers/123',
  deadline: null,
  summary: 'Rol frontend remoto.',
};

describe('verificarContraTexto', () => {
  it('mantiene lo que aparece en el texto, con salarios escritos con puntos', () => {
    const texto = 'Rappi busca Frontend Developer. Salario: $8.000.000 a $10.000.000 COP. Aplica en https://rappi.com/careers/123';
    const r = verificarContraTexto(base, texto);
    expect(r.descartados).toEqual([]);
    expect(r.oferta).toEqual(base);
  });

  it('descarta empresa, link y salario que no están en el texto (inventados)', () => {
    const texto = 'Startup busca Frontend Developer remoto. Salario a convenir.';
    const r = verificarContraTexto(base, texto);
    expect(r.oferta.company).toBeNull();
    expect(r.oferta.applyUrl).toBeNull();
    expect(r.oferta.salary).toEqual({ min: null, max: null, currency: null, period: null });
    expect(r.descartados).toEqual(['company', 'applyUrl', 'salary.min', 'salary.max']);
  });

  it('acepta salarios abreviados (4k, 8M, 8,000,000)', () => {
    const conK = { ...base, salary: { min: 4000, max: 5000, currency: 'USD', period: 'month' as const } };
    expect(verificarContraTexto(conK, 'Rappi paga 4k - 5k USD al mes. https://rappi.com/careers/123').descartados).toEqual([]);
    expect(verificarContraTexto(base, 'Rappi: 8M a 10M COP. https://rappi.com/careers/123').descartados).toEqual([]);
    expect(verificarContraTexto(base, 'Rappi: 8,000,000 - 10,000,000 COP https://rappi.com/careers/123').descartados).toEqual([]);
  });
});

describe('ofertaSchema', () => {
  it('rechaza modalidades fuera de la lista', () => {
    expect(ofertaSchema.safeParse({ ...base, modality: 'presencial' }).success).toBe(false);
    expect(ofertaSchema.safeParse(base).success).toBe(true);
  });

  // En la primera evaluación real, qwen3:4b devolvió una fecha inválida en una
  // oferta sin fecha límite y eso tumbaba toda la extracción (422).
  it('toma una fecha mal escrita como "no la da" (null) en vez de fallar', () => {
    for (const deadline of ['15/10/2026', '', 'N/A', 'no especificada', '2026-13-45']) {
      const r = ofertaSchema.safeParse({ ...base, deadline });
      expect(r.success).toBe(true);
      expect(r.success && r.data.deadline).toBeNull();
    }
    expect(ofertaSchema.parse({ ...base, deadline: '2026-10-31' }).deadline).toBe('2026-10-31');
  });

  it('convierte los "vacíos" del modelo en null', () => {
    const r = ofertaSchema.parse({ ...base, company: 'N/A', language: '', location: 'null', applyUrl: 'none' });
    expect(r).toMatchObject({ company: null, language: null, location: null, applyUrl: null });
  });
});

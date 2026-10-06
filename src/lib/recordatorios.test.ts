import { describe, it, expect } from 'vitest';
import { calcularRecordatorio, zonaHorariaValida, DatosRecordatorio } from './recordatorios';

// "Hoy" fijo: 5 de octubre de 2026 a mediodía en Colombia (17:00 UTC).
const HOY = new Date('2026-10-05T17:00:00.000Z');
const BOGOTA = 'America/Bogota';

/** Un instante N días antes de HOY. */
function haceDias(n: number): Date {
  return new Date(HOY.getTime() - n * 24 * 60 * 60 * 1000);
}

function app(overrides: Partial<DatosRecordatorio>): DatosRecordatorio {
  return { status: 'APLICADO', statusChangedAt: haceDias(0), lastFollowUpAt: null, deadline: null, ...overrides };
}

describe('Aplicado', () => {
  it('no avisa el día 13 y avisa desde el día 14', () => {
    expect(calcularRecordatorio(app({ statusChangedAt: haceDias(13) }), HOY)).toBeNull();
    expect(calcularRecordatorio(app({ statusChangedAt: haceDias(14) }), HOY)).toEqual({
      tipo: 'sin-respuesta',
      dias: 14,
      texto: 'Sin respuesta · 14 días',
    });
  });

  it('un seguimiento reciente reinicia la cuenta', () => {
    expect(calcularRecordatorio(app({ statusChangedAt: haceDias(30), lastFollowUpAt: haceDias(2) }), HOY)).toBeNull();
  });

  it('un seguimiento viejo no tapa un cambio de estado más reciente', () => {
    const r = calcularRecordatorio(app({ statusChangedAt: haceDias(15), lastFollowUpAt: haceDias(40) }), HOY);
    expect(r?.dias).toBe(15);
  });
});

describe('Entrevista', () => {
  it('avisa desde el día 7 sin novedades', () => {
    expect(calcularRecordatorio(app({ status: 'ENTREVISTA', statusChangedAt: haceDias(6) }), HOY)).toBeNull();
    expect(calcularRecordatorio(app({ status: 'ENTREVISTA', statusChangedAt: haceDias(9) }), HOY)).toEqual({
      tipo: 'sin-novedades',
      dias: 9,
      texto: 'Sin novedades · 9 días',
    });
  });
});

describe('Por aplicar (fecha límite)', () => {
  const porAplicar = (deadline: string | null) =>
    app({ status: 'POR_APLICAR', deadline: deadline ? new Date(deadline) : null, statusChangedAt: haceDias(60) });

  it('no avisa sin fecha límite, aunque lleve mucho tiempo', () => {
    expect(calcularRecordatorio(porAplicar(null), HOY, BOGOTA)).toBeNull();
  });

  it('avisa desde 3 días antes, no 4', () => {
    expect(calcularRecordatorio(porAplicar('2026-10-09'), HOY, BOGOTA)).toBeNull();
    expect(calcularRecordatorio(porAplicar('2026-10-08'), HOY, BOGOTA)?.texto).toBe('Cierra en 3 días');
  });

  it('dice "hoy", "mañana" y "cerró" según el caso', () => {
    expect(calcularRecordatorio(porAplicar('2026-10-06'), HOY, BOGOTA)?.texto).toBe('Cierra mañana');
    expect(calcularRecordatorio(porAplicar('2026-10-05'), HOY, BOGOTA)?.texto).toBe('Cierra hoy');
    expect(calcularRecordatorio(porAplicar('2026-10-04'), HOY, BOGOTA)?.texto).toBe('Cerró ayer');
    expect(calcularRecordatorio(porAplicar('2026-10-01'), HOY, BOGOTA)).toMatchObject({ dias: -4, texto: 'Cerró hace 4 días' });
  });

  it('a las 11:30 p. m. en Colombia sigue siendo "hoy", aunque en UTC ya sea mañana', () => {
    const noche = new Date('2026-10-06T04:30:00.000Z'); // 5 oct, 23:30 en Bogotá
    expect(calcularRecordatorio(porAplicar('2026-10-05'), noche, BOGOTA)?.texto).toBe('Cierra hoy');
    // Sin la zona horaria, el servidor (UTC) ya lo contaría como ayer: por eso hace falta.
    expect(calcularRecordatorio(porAplicar('2026-10-05'), noche, 'UTC')?.texto).toBe('Cerró ayer');
  });
});

describe('Oferta y Rechazado', () => {
  it('nunca avisan, por viejas que sean', () => {
    expect(calcularRecordatorio(app({ status: 'OFERTA', statusChangedAt: haceDias(100) }), HOY)).toBeNull();
    expect(calcularRecordatorio(app({ status: 'RECHAZADO', statusChangedAt: haceDias(100) }), HOY)).toBeNull();
  });
});

describe('zonaHorariaValida', () => {
  it('acepta zonas IANA y cae a UTC con cualquier otra cosa', () => {
    expect(zonaHorariaValida('America/Bogota')).toBe('America/Bogota');
    expect(zonaHorariaValida('Marte/Olympus')).toBe('UTC');
    expect(zonaHorariaValida(undefined)).toBe('UTC');
    expect(zonaHorariaValida(['America/Bogota'])).toBe('UTC');
    expect(zonaHorariaValida('x'.repeat(65))).toBe('UTC');
  });
});

/**
 * Reglas de los recordatorios de seguimiento. Viven acá (y no en el frontend)
 * para que el tablero y la revisión con IA usen exactamente las mismas: cada
 * postulación sale de la API con su `aviso` ya calculado.
 */

/** Días que se esperan antes de avisar. */
export const UMBRALES = {
  /** "Por aplicar": avisar cuando falten estos días (o menos) para la fecha límite. */
  cierre: 3,
  /** "Aplicado": días sin respuesta ni seguimiento. */
  aplicado: 14,
  /** "Entrevista": días sin novedades después de la entrevista. */
  entrevista: 7,
} as const;

export type TipoRecordatorio = 'cierre' | 'sin-respuesta' | 'sin-novedades';

export interface Recordatorio {
  tipo: TipoRecordatorio;
  /** Para 'cierre': días que faltan (negativo si ya cerró). Para los demás: días transcurridos. */
  dias: number;
  /** Texto corto para la tarjeta. */
  texto: string;
}

/** Lo mínimo que hace falta de una postulación para calcular su aviso. */
export interface DatosRecordatorio {
  status: string;
  statusChangedAt: Date;
  lastFollowUpAt: Date | null;
  deadline: Date | null;
}

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * La zona horaria que manda el frontend en `X-Timezone` (por ejemplo
 * "America/Bogota"), o UTC si no viene o no es válida. Hace falta porque el
 * servidor corre en UTC: sin esto, desde las 7 p. m. en Colombia el servidor
 * ya estaría en "mañana" y la fecha límite se contaría un día corrida.
 */
export function zonaHorariaValida(valor: unknown): string {
  if (typeof valor !== 'string' || valor.length === 0 || valor.length > 64) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: valor });
    return valor;
  } catch {
    return 'UTC';
  }
}

/** Días completos transcurridos entre dos instantes (16 días y 5 horas cuenta 16). No depende de la zona horaria. */
function diasTranscurridos(desde: Date, hoy: Date): number {
  return Math.floor((hoy.getTime() - desde.getTime()) / DIA_MS);
}

/**
 * Días de calendario que faltan para una fecha sin hora (el deadline se guarda
 * como medianoche UTC del día elegido), contados desde el día de hoy *en la
 * zona horaria del usuario*.
 */
function diasHasta(fecha: Date, hoy: Date, zonaHoraria: string): number {
  // "en-CA" formatea como YYYY-MM-DD.
  const hoyLocal = new Intl.DateTimeFormat('en-CA', {
    timeZone: zonaHoraria,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(hoy);
  const limiteDia = Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate());
  return Math.round((limiteDia - Date.parse(hoyLocal)) / DIA_MS);
}

function textoCierre(dias: number): string {
  if (dias < 0) return dias === -1 ? 'Cerró ayer' : `Cerró hace ${-dias} días`;
  if (dias === 0) return 'Cierra hoy';
  if (dias === 1) return 'Cierra mañana';
  return `Cierra en ${dias} días`;
}

/** El último "movimiento" de la postulación: cambio de estado o seguimiento, el más reciente. */
function ultimoMovimiento(app: DatosRecordatorio): Date {
  if (app.lastFollowUpAt && app.lastFollowUpAt > app.statusChangedAt) return app.lastFollowUpAt;
  return app.statusChangedAt;
}

/** El aviso que corresponde a una postulación hoy, o null si no hace falta ninguno. */
export function calcularRecordatorio(
  app: DatosRecordatorio,
  hoy: Date = new Date(),
  zonaHoraria = 'UTC',
): Recordatorio | null {
  switch (app.status) {
    case 'POR_APLICAR': {
      if (!app.deadline) return null;
      const dias = diasHasta(app.deadline, hoy, zonaHoraria);
      return dias <= UMBRALES.cierre ? { tipo: 'cierre', dias, texto: textoCierre(dias) } : null;
    }
    case 'APLICADO': {
      const dias = diasTranscurridos(ultimoMovimiento(app), hoy);
      return dias >= UMBRALES.aplicado ? { tipo: 'sin-respuesta', dias, texto: `Sin respuesta · ${dias} días` } : null;
    }
    case 'ENTREVISTA': {
      const dias = diasTranscurridos(ultimoMovimiento(app), hoy);
      return dias >= UMBRALES.entrevista ? { tipo: 'sin-novedades', dias, texto: `Sin novedades · ${dias} días` } : null;
    }
    // Oferta y Rechazado: la pelota ya no está en la cancha de nadie.
    default:
      return null;
  }
}

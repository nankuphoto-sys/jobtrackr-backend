// Extracción de una oferta de empleo con el modelo local.
// Flujo: prompt + JSON Schema → Ollama → validación con Zod (1 reintento) →
// comprobación contra el texto (descarta datos que no aparecen en la oferta).
import { z } from 'zod';
import { ollamaChat } from './ollama';

export const MAX_TEXTO = 15000;

// Las definiciones campo por campo salieron de la primera evaluación con
// qwen3:4b (npm run eval:extractor): sin ellas confundía "presencial" con
// remoto, "Semi-Senior" con senior y el idioma requerido con el de la oferta.
export const SYSTEM_PROMPT = [
  'Eres un extractor de datos de ofertas de empleo. Respondes solo con el JSON pedido.',
  'Extrae solo lo que dice el texto. Si un dato no aparece, usa null o "unknown".',
  'Nunca inventes salario, empresa ni fechas.',
  '',
  'Campos:',
  '- company: el nombre de la empresa EXACTAMENTE como está escrito (solo el nombre, sin el cargo ni otros textos). null si no se nombra (por ejemplo "nuestro cliente").',
  '- role: el título del cargo tal como aparece.',
  '- location: solo ciudad y/o país (ejemplo: "Bogotá, Colombia"). Si es una región, la región ("Latinoamérica"). null si no dice un lugar.',
  '- modality: "onsite" si dice presencial, en oficina u on-site; "hybrid" si dice híbrido o mezcla días en oficina y remotos; "remote" si dice remoto o 100% remote; "unknown" si no lo dice.',
  '- seniority: "junior" (junior, trainee, recién egresado, 0-2 años); "mid" (semi-senior, Ssr, mid, 2-5 años); "senior" (senior, Sr, lead, más de 5 años); "unknown" si no hay pistas.',
  '- salary: min y max son los montos del texto copiados tal cual, solo quitando los separadores de miles. Nunca los multipliques ni los conviertas. Ejemplos: "8.000.000" → 8000000; "70,000" → 70000; "$25" → 25; "4k" → 4000. currency es el código ISO (COP, USD, EUR) solo si el texto lo escribe; el signo $ solo no indica la moneda. period: month, year u hour.',
  '- stack: todas las tecnologías concretas que nombra, incluidas herramientas de pruebas, control de versiones y diseño (por ejemplo Jest, Git, Figma).',
  '- requirements: los demás requisitos (años de experiencia, estudios, habilidades).',
  '- language: el idioma que se EXIGE para el trabajo, con su nivel si lo dice (ejemplo: "Inglés B2"). null si no exige un idioma. No es el idioma en que está escrita la oferta.',
  '- applyUrl: la URL para postular, solo si aparece una URL (no un correo).',
  '- deadline: la fecha límite para postular en formato YYYY-MM-DD. null si no la da.',
  '- summary: máximo 2 frases, en español, aunque la oferta esté en otro idioma.',
].join('\n');

const nullableString = { type: ['string', 'null'] };

/** JSON Schema que recibe Ollama en `format` (restringe lo que puede generar). */
export const OFERTA_JSON_SCHEMA = {
  type: 'object',
  properties: {
    company: nullableString,
    role: { type: 'string' },
    location: nullableString,
    modality: { type: 'string', enum: ['remote', 'hybrid', 'onsite', 'unknown'] },
    seniority: { type: 'string', enum: ['junior', 'mid', 'senior', 'unknown'] },
    salary: {
      type: 'object',
      properties: {
        min: { type: ['number', 'null'] },
        max: { type: ['number', 'null'] },
        currency: nullableString,
        period: { type: ['string', 'null'], enum: ['month', 'year', 'hour', null] },
      },
      required: ['min', 'max', 'currency', 'period'],
    },
    stack: { type: 'array', items: { type: 'string' } },
    requirements: { type: 'array', items: { type: 'string' } },
    language: nullableString,
    applyUrl: nullableString,
    deadline: nullableString,
    summary: { type: 'string' },
  },
  required: [
    'company', 'role', 'location', 'modality', 'seniority', 'salary',
    'stack', 'requirements', 'language', 'applyUrl', 'deadline', 'summary',
  ],
};

// Valores que el modelo usa para "no hay dato" en vez de null.
const VACIOS = new Set(['', 'null', 'none', 'n/a', 'na', 'no especificado', 'no especificada', 'unknown', 'desconocido']);
/** Texto opcional: los "vacíos" del modelo ("", "N/A", "null"…) cuentan como null. */
const textoOpcional = z.preprocess(
  (v) => (typeof v === 'string' && VACIOS.has(v.trim().toLowerCase()) ? null : v),
  z.string().trim().min(1).nullable(),
);
/** Fecha opcional: lo que no sea YYYY-MM-DD válido se toma como "no la da" (null), en vez de tumbar toda la extracción. */
const fechaOpcional = z.preprocess((v) => {
  if (typeof v !== 'string') return v ?? null;
  const s = v.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : null;
}, z.string().nullable());

/** El mismo contrato, validado del lado del servidor (el modelo puede fallar igual). */
export const ofertaSchema = z.object({
  company: textoOpcional,
  role: z.string().trim().min(1),
  location: textoOpcional,
  modality: z.enum(['remote', 'hybrid', 'onsite', 'unknown']),
  seniority: z.enum(['junior', 'mid', 'senior', 'unknown']),
  salary: z.object({
    min: z.number().nonnegative().nullable(),
    max: z.number().nonnegative().nullable(),
    currency: textoOpcional,
    period: z.enum(['month', 'year', 'hour']).nullable(),
  }),
  stack: z.array(z.string().trim().min(1)).max(40),
  requirements: z.array(z.string().trim().min(1)).max(40),
  language: textoOpcional,
  applyUrl: textoOpcional,
  deadline: fechaOpcional,
  summary: z.string().trim().max(600),
});

export type Oferta = z.infer<typeof ofertaSchema>;

export class OfertaInvalida extends Error {}

const soloDigitos = (s: string) => s.replace(/\D/g, '');

/** ¿El número aparece en el texto, aunque esté escrito como 8.000.000, 8,000,000, 4k o 8M? */
function numeroEnTexto(n: number, texto: string): boolean {
  const digitos = soloDigitos(texto.replace(/(\d)[.,](\d{3})/g, '$1$2'));
  if (digitos.includes(String(Math.round(n)))) return true;
  const t = texto.toLowerCase();
  if (n % 1000 === 0 && new RegExp(`\\b${n / 1000}\\s?k\\b`).test(t)) return true;
  if (n % 1000000 === 0 && new RegExp(`\\b${n / 1000000}\\s?(m|millones?)\\b`).test(t)) return true;
  if (n % 100000 === 0 && new RegExp(`\\b${String(n / 1000000).replace('.', '[.,]')}\\s?(m|millones?)\\b`).test(t)) return true;
  return false;
}

/**
 * Descarta los datos que el modelo pudo inventar: empresa, link y salario solo
 * se aceptan si aparecen en el texto. Devuelve la oferta limpia y la lista de
 * campos descartados (para que el frontend pueda avisar).
 */
export function verificarContraTexto(oferta: Oferta, texto: string): { oferta: Oferta; descartados: string[] } {
  const t = texto.toLowerCase();
  const limpia: Oferta = { ...oferta, salary: { ...oferta.salary } };
  const descartados: string[] = [];

  if (limpia.company && !t.includes(limpia.company.toLowerCase())) {
    limpia.company = null;
    descartados.push('company');
  }
  if (limpia.applyUrl && !t.includes(limpia.applyUrl.toLowerCase().replace(/\/$/, ''))) {
    limpia.applyUrl = null;
    descartados.push('applyUrl');
  }
  for (const k of ['min', 'max'] as const) {
    const n = limpia.salary[k];
    if (n !== null && !numeroEnTexto(n, texto)) {
      limpia.salary[k] = null;
      descartados.push(`salary.${k}`);
    }
  }
  // Sin montos, la moneda y el periodo no dicen nada.
  if (limpia.salary.min === null && limpia.salary.max === null) {
    limpia.salary.currency = null;
    limpia.salary.period = null;
  }
  return { oferta: limpia, descartados };
}

/**
 * Extrae la oferta. Si la respuesta no es JSON válido o no cumple el esquema,
 * reintenta una vez; si vuelve a fallar, lanza OfertaInvalida (→ 422).
 * Si Ollama no responde, propaga OllamaNoDisponible (→ 503).
 */
export async function extraerOferta(texto: string, chat = ollamaChat) {
  let ultimoError = '';
  for (let intento = 1; intento <= 2; intento++) {
    const contenido = await chat({ system: SYSTEM_PROMPT, user: texto, format: OFERTA_JSON_SCHEMA });
    let json: unknown;
    try {
      json = JSON.parse(contenido);
    } catch {
      ultimoError = 'la respuesta no es JSON';
      continue;
    }
    const r = ofertaSchema.safeParse(json);
    if (r.success) return { ...verificarContraTexto(r.data, texto), intentos: intento };
    ultimoError = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  }
  throw new OfertaInvalida(ultimoError);
}

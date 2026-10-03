// Extracción de una oferta de empleo con el modelo local.
// Flujo: prompt + JSON Schema → Ollama → validación con Zod (1 reintento) →
// comprobación contra el texto (descarta datos que no aparecen en la oferta).
import { z } from 'zod';
import { ollamaChat } from './ollama';

export const MAX_TEXTO = 15000;

export const SYSTEM_PROMPT = [
  'Eres un extractor de datos de ofertas de empleo. Respondes solo con el JSON pedido.',
  'Extrae solo lo que dice el texto. Si un dato no aparece, usa null o "unknown".',
  'Nunca inventes salario, empresa ni fechas.',
  'Los salarios van como número entero, sin separadores de miles (8.000.000 → 8000000; 4k → 4000).',
  'currency es el código ISO de la moneda (COP, USD, EUR…) solo si el texto la indica.',
  'deadline es la fecha límite para postular, en formato YYYY-MM-DD, solo si el texto la da.',
  'stack son tecnologías concretas (lenguajes, frameworks, herramientas). requirements son los demás requisitos.',
  'summary: máximo 2 frases, en español, aunque la oferta esté en otro idioma.',
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

/** El mismo contrato, validado del lado del servidor (el modelo puede fallar igual). */
export const ofertaSchema = z.object({
  company: z.string().trim().min(1).nullable(),
  role: z.string().trim().min(1),
  location: z.string().trim().min(1).nullable(),
  modality: z.enum(['remote', 'hybrid', 'onsite', 'unknown']),
  seniority: z.enum(['junior', 'mid', 'senior', 'unknown']),
  salary: z.object({
    min: z.number().nonnegative().nullable(),
    max: z.number().nonnegative().nullable(),
    currency: z.string().trim().min(1).nullable(),
    period: z.enum(['month', 'year', 'hour']).nullable(),
  }),
  stack: z.array(z.string().trim().min(1)).max(40),
  requirements: z.array(z.string().trim().min(1)).max(40),
  language: z.string().trim().min(1).nullable(),
  applyUrl: z.string().trim().min(1).nullable(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
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

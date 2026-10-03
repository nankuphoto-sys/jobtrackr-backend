// Evaluación del extractor contra Ollama REAL: corre las ofertas de
// fixtures/ofertas/, compara campo por campo con su `.esperado.json` y mide la
// latencia. Uso: npm run eval:extractor   (necesita Ollama abierto y el modelo)
//
// Criterios de la spec que se comprueban:
//   - ningún dato inventado (empresa, salario, link, fecha cuando no aparecen)
//   - menos de 15 s por oferta
// Sale con código 1 si alguno no se cumple.
import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extraerOferta, type Oferta } from '../src/lib/extraerOferta';
import { configOllama } from '../src/lib/ollama';

const DIR = join(__dirname, '..', 'fixtures', 'ofertas');
const LIMITE_MS = 15000;

type Esperado = Pick<Oferta, 'company' | 'role' | 'location' | 'modality' | 'seniority' | 'salary' | 'stack' | 'language' | 'applyUrl' | 'deadline'>;

const norm = (s: unknown) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9.+#/: ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Igual si ambos son null, o si los textos normalizados coinciden o uno contiene al otro. */
function parecido(esperado: unknown, obtenido: unknown) {
  if (esperado === null || esperado === undefined) return obtenido === null || obtenido === undefined || obtenido === 'unknown';
  if (obtenido === null || obtenido === undefined) return false;
  const [a, b] = [norm(esperado), norm(obtenido)];
  return a === b || a.includes(b) || b.includes(a);
}

// Idioma requerido: "English" e "Inglés B2" son el mismo idioma. Antes solo se
// comparaba si estaba vacío o no, y daba por bueno "es" cuando se esperaba inglés.
const IDIOMAS: Record<string, string> = { english: 'ingles', ingles: 'ingles', spanish: 'espanol', espanol: 'espanol', es: 'espanol', en: 'ingles' };
function mismoIdioma(esperado: string | null, obtenido: string | null) {
  if (esperado === null) return obtenido === null;
  if (obtenido === null) return false;
  const clave = (s: string) => IDIOMAS[norm(s).split(' ')[0]] ?? norm(s).split(' ')[0];
  return clave(esperado) === clave(obtenido);
}

function cobertura(esperado: string[], obtenido: string[]) {
  if (!esperado.length) return 1;
  const got = obtenido.map(norm);
  return esperado.filter((e) => got.some((g) => g.includes(norm(e)) || norm(e).includes(g))).length / esperado.length;
}

async function main() {
  const { model, url } = configOllama();
  console.log(`Modelo: ${model} en ${url}\n`);

  // Calentamiento: la primera llamada con el modelo en frío lo carga en memoria
  // (~40 s con qwen3:4b). En la app eso lo absorbe la precarga de GET /ai/status;
  // aquí se mide aparte para que no cuente contra el criterio de 15 s por oferta.
  const t0 = Date.now();
  await extraerOferta('Acme busca Desarrollador Junior.').catch(() => null);
  console.log(`Arranque en frío (carga del modelo): ${Date.now() - t0} ms\n`);

  const archivos = readdirSync(DIR).filter((f) => f.endsWith('.txt')).sort();
  let inventadosTotal = 0;
  let lentas = 0;
  let aciertos = 0;
  let campos = 0;

  for (const archivo of archivos) {
    const texto = readFileSync(join(DIR, archivo), 'utf8');
    const esperado = JSON.parse(readFileSync(join(DIR, archivo.replace(/\.txt$/, '.esperado.json')), 'utf8')) as Esperado;

    const t0 = Date.now();
    let r: Awaited<ReturnType<typeof extraerOferta>>;
    try {
      r = await extraerOferta(texto);
    } catch (e) {
      console.log(`✗ ${archivo}: ${(e as Error).message}\n`);
      lentas++;
      continue;
    }
    const ms = Date.now() - t0;
    if (ms > LIMITE_MS) lentas++;
    const o = r.oferta;

    const filas: [string, unknown, unknown, boolean][] = [
      ['company', esperado.company, o.company, parecido(esperado.company, o.company)],
      ['role', esperado.role, o.role, parecido(esperado.role, o.role)],
      ['location', esperado.location, o.location, parecido(esperado.location, o.location)],
      ['modality', esperado.modality, o.modality, esperado.modality === o.modality],
      ['seniority', esperado.seniority, o.seniority, esperado.seniority === o.seniority],
      ['salary.min', esperado.salary.min, o.salary.min, esperado.salary.min === o.salary.min],
      ['salary.max', esperado.salary.max, o.salary.max, esperado.salary.max === o.salary.max],
      ['salary.currency', esperado.salary.currency, o.salary.currency, parecido(esperado.salary.currency, o.salary.currency)],
      ['salary.period', esperado.salary.period, o.salary.period, esperado.salary.period === o.salary.period],
      ['language', esperado.language, o.language, mismoIdioma(esperado.language, o.language)],
      ['applyUrl', esperado.applyUrl, o.applyUrl, parecido(esperado.applyUrl, o.applyUrl)],
      ['deadline', esperado.deadline, o.deadline, esperado.deadline === o.deadline],
    ];
    // "Inventado" = la oferta no lo dice (esperado null) y el resultado trae un valor.
    // Son los datos que la spec prohíbe inventar: empresa, salario, fechas (y el link).
    const inventados = (['company', 'salary.min', 'salary.max', 'applyUrl', 'deadline'] as const).filter((campo) => {
      const fila = filas.find((f) => f[0] === campo)!;
      return fila[1] === null && fila[2] !== null;
    });
    inventadosTotal += inventados.length;
    const stack = cobertura(esperado.stack, o.stack);

    console.log(`── ${archivo}  ${ms} ms${ms > LIMITE_MS ? '  ⚠ LENTA' : ''}  (intentos: ${r.intentos})`);
    for (const [campo, esp, obt, ok] of filas) {
      console.log(`  ${ok ? '✓' : '✗'} ${campo.padEnd(16)} esperado: ${JSON.stringify(esp)}  obtenido: ${JSON.stringify(obt)}`);
      campos++;
      aciertos += ok ? 1 : 0;
    }
    console.log(`  · stack: ${Math.round(stack * 100)}% de lo esperado  → ${JSON.stringify(o.stack)}`);
    if (r.descartados.length) console.log(`  · descartados por no estar en el texto: ${r.descartados.join(', ')}`);
    if (inventados.length) console.log(`  ⚠ INVENTADOS: ${inventados.join(', ')}`);
    console.log(`  · resumen: ${o.summary}\n`);
  }

  console.log(`Acierto: ${aciertos}/${campos} campos (${Math.round((100 * aciertos) / Math.max(campos, 1))}%)`);
  console.log(`Inventados: ${inventadosTotal} (criterio: 0)`);
  console.log(`Ofertas lentas o fallidas (>${LIMITE_MS / 1000} s): ${lentas} (criterio: 0)`);
  process.exit(inventadosTotal === 0 && lentas === 0 ? 0 : 1);
}

main();

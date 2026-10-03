// Cliente mínimo de la API de chat de Ollama (modelo local).
// Docs: POST /api/chat con `stream: false` devuelve { message: { content } }.

export class OllamaNoDisponible extends Error {}

const MENSAJE_NO_DISPONIBLE = 'El modelo local no está disponible. ¿Está abierto Ollama?';

export function configOllama() {
  return {
    url: process.env.OLLAMA_URL ?? 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL ?? 'qwen3:4b',
    timeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS ?? 60000),
    habilitado: process.env.AI_EXTRACTOR_ENABLED === 'true',
  };
}

/**
 * Llama al modelo con salida estructurada: `format` recibe un JSON Schema y
 * Ollama restringe la generación a ese formato. `temperature: 0` para que la
 * misma oferta dé el mismo resultado; `think: false` porque los modelos qwen3
 * "razonan" en voz alta por defecto y eso multiplica la latencia sin mejorar
 * una extracción.
 *
 * Lanza OllamaNoDisponible si Ollama no responde, se pasa del timeout o no
 * tiene el modelo descargado.
 */
export async function ollamaChat(params: { system: string; user: string; format: object }): Promise<string> {
  const { url, model, timeoutMs } = configOllama();
  const controller = new AbortController();
  const reloj = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        format: params.format,
        options: { temperature: 0 },
        messages: [
          { role: 'system', content: params.system },
          { role: 'user', content: params.user },
        ],
      }),
    });
  } catch {
    // Conexión rechazada (Ollama cerrado) o timeout (AbortError).
    throw new OllamaNoDisponible(MENSAJE_NO_DISPONIBLE);
  } finally {
    clearTimeout(reloj);
  }

  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    // Ollama responde 404 cuando el modelo no está descargado.
    const sinModelo = res.status === 404 ? ` Falta el modelo: ejecuta \`ollama pull ${model}\`.` : '';
    throw new OllamaNoDisponible(`${MENSAJE_NO_DISPONIBLE}${sinModelo}${detalle ? ` (${detalle.slice(0, 200)})` : ''}`);
  }

  const data = (await res.json()) as { message?: { content?: string } };
  return data.message?.content ?? '';
}

/** Comprueba en 2 s si Ollama responde (para que el frontend sepa si mostrar el extractor). */
export async function ollamaResponde(): Promise<boolean> {
  const { url } = configOllama();
  try {
    const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

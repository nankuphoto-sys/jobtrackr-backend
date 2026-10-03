import { Router } from 'express';
import { configOllama, ollamaResponde, OllamaNoDisponible } from '../lib/ollama';
import { extraerOferta, MAX_TEXTO, OfertaInvalida } from '../lib/extraerOferta';

const router = Router();

// El frontend lo consulta para decidir si ofrece "Extraer con IA local" o solo
// el formulario manual. En producción (Render) el extractor está apagado: el
// modelo corre en la PC del usuario y Render no puede alcanzarlo.
router.get('/status', async (_req, res) => {
  const { habilitado, model } = configOllama();
  res.json({ habilitado, modelo: model, disponible: habilitado ? await ollamaResponde() : false });
});

// No guarda nada: devuelve los datos extraídos para que el usuario los revise
// y edite. Guardar es una acción aparte (POST /applications).
router.post('/extract-job', async (req, res) => {
  if (!configOllama().habilitado) {
    return res.status(503).json({ error: 'El extractor de IA está desactivado en este servidor. Completa la tarjeta a mano.' });
  }

  const { text } = req.body ?? {};
  if (typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'Pega el texto de la oferta.' });
  }
  if (text.length > MAX_TEXTO) {
    return res.status(400).json({ error: `El texto supera ${MAX_TEXTO.toLocaleString('es-CO')} caracteres. Pega solo la oferta.` });
  }

  const inicio = Date.now();
  try {
    const { oferta, descartados, intentos } = await extraerOferta(text);
    res.json({ oferta, descartados, intentos, ms: Date.now() - inicio });
  } catch (err) {
    if (err instanceof OllamaNoDisponible) return res.status(503).json({ error: err.message });
    if (err instanceof OfertaInvalida) {
      return res.status(422).json({
        error: 'El modelo devolvió datos que no cumplen el formato esperado, incluso al reintentar. Intenta de nuevo o completa la tarjeta a mano.',
        detalle: err.message,
      });
    }
    throw err;
  }
});

export default router;

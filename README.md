# JobTrackr — Backend (API REST)

API REST en Node.js + Express + TypeScript para JobTrackr, el tablero de seguimiento de postulaciones de empleo. Plan completo del proyecto: [`PLAN.md`](./PLAN.md).

**API en vivo:** https://jobtrackr-backend-ul8d.onrender.com (`/health` para probar) — usada por el [frontend en producción](https://jobtrackr-frontend-two.vercel.app). Free tier de Render: se duerme tras inactividad, la primera request puede tardar ~30-50s.

## Stack

- Node.js + Express + TypeScript
- Prisma + PostgreSQL (Neon)
- Auth con JWT + bcrypt

## Setup

1. `npm install`
2. Copia `.env.example` a `.env` y completa `DATABASE_URL` (Neon) y `JWT_SECRET`.
3. `npx prisma migrate dev --name init` para crear las tablas.
4. `npm run dev` — el servidor queda en `http://localhost:4000`.
5. Prueba `GET /health` — debería responder `{ "status": "ok" }`.

## Extractor de ofertas con IA local (opcional)

Pegas el texto de una oferta en el tablero y un modelo **local** ([Ollama](https://ollama.com)) extrae empresa, cargo, modalidad, salario, stack, etc. para prellenar la tarjeta. Sin costo por llamada y sin enviar la oferta a la nube. Tú revisas y editas antes de guardar.

**Solo funciona con el backend corriendo en tu PC.** En producción (Render) está apagado: el modelo vive en tu computadora y Render no puede alcanzarlo. Si está apagado o Ollama no responde, la app muestra un aviso y deja llenar la tarjeta a mano.

1. Instala Ollama: https://ollama.com/download (en Windows, el instalador lo deja corriendo en segundo plano).
2. Descarga el modelo: `ollama pull qwen3:4b` (~2.5 GB; alternativa: `gemma3:4b`).
3. En tu `.env`:
   ```
   AI_EXTRACTOR_ENABLED=true
   OLLAMA_URL=http://localhost:11434
   OLLAMA_MODEL=qwen3:4b
   ```
4. Reinicia `npm run dev`. `GET /ai/status` debería responder `{ "habilitado": true, "disponible": true }`.
5. Mide el acierto y la latencia con las 5 ofertas de ejemplo: `npm run eval:extractor`.

**Cómo funciona:** `POST /ai/extract-job` con `{ "text": "…" }` (máx. 15.000 caracteres) llama a `POST /api/chat` de Ollama con salida estructurada (JSON Schema en `format`, `temperature: 0`) y valida la respuesta con Zod; si no cumple el esquema reintenta una vez y si vuelve a fallar responde **422**. Si Ollama no responde en 60 s responde **503**. El endpoint **no guarda nada**. Además, empresa, link y salario solo se aceptan si aparecen en el texto: lo que el modelo devuelva y no esté en la oferta se descarta (`descartados` en la respuesta).

**Resultados medidos** (`qwen3:4b`, RTX 4060 Ti 16 GB, 3 de octubre de 2026):

| Corrida | Acierto | Inventados | Tiempo por oferta | Qué cambió |
|---|---|---|---|---|
| 1ª | 40/48 (83 %) | 0 | ~4 s (43 s la primera, con el modelo en frío) | Prompt corto. Confundía "presencial" con remoto, "Semi-Senior" con senior y el idioma requerido con el de la oferta; una oferta falló entera por una fecha inválida |
| 2ª | 52/60 (87 %) | 0 | ~3,5 s | Definiciones campo por campo; fechas inválidas y "N/A" → null; precarga del modelo. El modelo multiplicó salarios por 100 (70.000 → 7.000.000): **la comprobación contra el texto los descartó** |
| 3ª | 59/60 (98 %) | 0 | ~3 s | Ejemplos de salario con comas y "nunca los multipliques" (y la oferta 2 esperando la región "Americas", coherente con la regla de ubicación) |

Lo que queda: con "$25" sin moneda escrita, el modelo infiere "USD". No es un dato inventado (el monto está en el texto), pero conviene revisarlo en el formulario.

**Ofertas de ejemplo** (`fixtures/ofertas/`): 5 ofertas **sintéticas** (empresas inventadas) que cubren español e inglés, sin salario, remota, en COP y sin nombre de empresa; cada una con su `.esperado.json`.

## Tests

`npm test` (Vitest + Supertest) — tests de integración reales contra la base de `DATABASE_URL` (no mockean Prisma): registro, login, CRUD completo de `/applications`, y aislamiento entre usuarios (que el usuario B no pueda leer, editar ni borrar una postulación del usuario A). El extractor (`/ai/extract-job`) se prueba con Ollama **simulado** (no hace falta tenerlo instalado): extracción, reintento, 422, 503 y descarte de datos inventados. Corren contra la misma base que uses en desarrollo; en CI corren contra un Postgres efímero aparte.

## Deploy

Desplegado en **Render** (Web Service, plan Free), conectado al repo de GitHub para auto-deploy en cada push a `main`.

- **Build Command**: `npm install && npm run build && npx prisma migrate deploy`
- **Start Command**: `npm run start`
- **Variables de entorno de producción**: `DATABASE_URL` (misma base de Neon que desarrollo — es un proyecto de portafolio, no un producto con datos de clientes reales), `JWT_SECRET` (uno nuevo, distinto al de desarrollo), `FRONTEND_URL` (restringe CORS al dominio real de Vercel en vez de aceptar cualquier origen), `SENTRY_DSN` (monitoreo de errores).

## Estado

**Fase 0 (setup) completada:** Express + TypeScript + Prisma configurados, modelos `User` y `JobApplication` definidos, endpoint `/health` funcionando.

**Fase 1 completada:** endpoints `/auth/register` y `/auth/login` (JWT + bcrypt), middleware `requireAuth`, y CRUD completo de `/applications` (scoped por usuario autenticado).

**Fase 5 completada:** deploy en Render (ver arriba). CORS configurable vía `FRONTEND_URL` y build script que corre `prisma generate` (necesario para que el cliente de Prisma no quede desactualizado en un build limpio). `bcrypt` actualizado a 6.0.0 por una vulnerabilidad crítica en una dependencia transitiva (`node-tar` vía `node-pre-gyp`).

**Pulido post-Fase 5:** 19 tests de integración (Vitest + Supertest) cubriendo auth y CRUD de `/applications`, corriendo también en CI contra un Postgres real efímero. `src/app.ts` se separó de `src/index.ts` (la app de Express sin el `.listen()`) específicamente para poder testearla con Supertest sin levantar un puerto. Monitoreo de errores en producción con **Sentry** (`src/instrument.ts`, cargado antes que cualquier otro módulo).

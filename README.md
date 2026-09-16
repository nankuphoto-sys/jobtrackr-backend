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

## Deploy

Desplegado en **Render** (Web Service, plan Free), conectado al repo de GitHub para auto-deploy en cada push a `main`.

- **Build Command**: `npm install && npm run build && npx prisma migrate deploy`
- **Start Command**: `npm run start`
- **Variables de entorno de producción**: `DATABASE_URL` (misma base de Neon que desarrollo — es un proyecto de portafolio, no un producto con datos de clientes reales), `JWT_SECRET` (uno nuevo, distinto al de desarrollo), `FRONTEND_URL` (restringe CORS al dominio real de Vercel en vez de aceptar cualquier origen).

## Estado

**Fase 0 (setup) completada:** Express + TypeScript + Prisma configurados, modelos `User` y `JobApplication` definidos, endpoint `/health` funcionando.

**Fase 1 completada:** endpoints `/auth/register` y `/auth/login` (JWT + bcrypt), middleware `requireAuth`, y CRUD completo de `/applications` (scoped por usuario autenticado).

**Fase 5 completada:** deploy en Render (ver arriba). CORS configurable vía `FRONTEND_URL` y build script que corre `prisma generate` (necesario para que el cliente de Prisma no quede desactualizado en un build limpio). `bcrypt` actualizado a 6.0.0 por una vulnerabilidad crítica en una dependencia transitiva (`node-tar` vía `node-pre-gyp`).

# JobTrackr — Backend (API REST)

API REST en Node.js + Express + TypeScript para JobTrackr, el tablero de seguimiento de postulaciones de empleo. Plan completo del proyecto: doc `plan-proyecto-portafolio-jobtrackr.md` en el proyecto "programacion".

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

## Estado

**Fase 0 (setup) completada:** Express + TypeScript + Prisma configurados, modelos `User` y `JobApplication` definidos, endpoint `/health` funcionando.

**Fase 1 (pendiente):** endpoints `/auth/register`, `/auth/login` (JWT + bcrypt) y CRUD de `/applications`.

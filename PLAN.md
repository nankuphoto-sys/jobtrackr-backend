# JobTrackr — Plan del proyecto

Proyecto de portafolio: cubre el stack que piden hoy las vacantes junior (React/Next.js, TypeScript, Node.js, REST APIs, Git, diseño responsive, Figma/Tailwind). Es un tablero Kanban para seguimiento de postulaciones de empleo (empresa, cargo, estado, fecha, link, notas), con dos repos separados:

- **jobtrackr-backend**: Node.js + Express + TypeScript + Prisma + PostgreSQL (Neon). API REST propia (no Next API routes, para que quede como habilidad separada). Auth con JWT + bcrypt hecho a mano.
- **jobtrackr-frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS. Mobile-first, responsive real.

Enfoque de aprendizaje: Jonta está aprendiendo a programar mientras construye esto — cada fase se explica (conceptos, trade-offs), no solo se ejecuta.

## Roadmap

1. **Fase 0 — Setup.** ✅ Completada. Los dos repos creados, scaffold inicial, subidos a GitHub (`nankuphoto-sys/jobtrackr-backend`, `nankuphoto-sys/jobtrackr-frontend`), backend conectado a Neon con tablas `User` y `JobApplication` migradas.

2. **Fase 1 — Backend REST API.** ✅ Completada. Rutas de auth (`/auth/register`, `/auth/login` con JWT+bcrypt) y CRUD completo de `/applications`, protegido con Authorization Bearer.

3. **Fase 2 — Frontend Next.js.** ✅ Completada. Cliente fetch centralizado con el header Authorization; páginas de registro y login que guardan el JWT; página protegida que lista las postulaciones del usuario; formularios para crear/editar/borrar postulaciones; todo con Tailwind mobile-first. Pulido después: auto-logout en 401, skeletons, confirmación de contraseña, tests (Vitest + Playwright) y CI en GitHub Actions en ambos repos.

4. **Fase 3 — Feature Kanban + dashboard.** ✅ Completada. `/applications` es un tablero con columnas por estado (Por aplicar → Aplicado → Entrevista → Oferta → Rechazado):
   - Drag & drop entre columnas con `@dnd-kit/core` (elegido sobre react-beautiful-dnd, que ya no se mantiene; da soporte de teclado accesible gratis vía su `KeyboardSensor`) que actualiza el estado vía `PUT /applications/:id`, optimista con rollback si falla.
   - Dashboard arriba del tablero: conteo total y por estado, "postulaciones esta semana", y "tasa de respuesta" (% de las ya aplicadas que avanzó a Entrevista u Oferta).
   - Responsive: columnas de ancho fijo en una fila con scroll horizontal + `snap`, así en mobile se sienten swipeables sin código extra para ese caso.
   - Cobertura e2e: agrupación por columna, drag-and-drop real (mouse events, no HTML5 DnD nativo porque dnd-kit usa Pointer Events), y métricas.

5. **Fase 4 — Pulido.** Manejo de errores (mensajes claros si la API falla), loading states (skeletons o spinners), accesibilidad básica (labels, contraste, navegación por teclado), QA en mobile real.

6. **Fase 5 — Deploy + documentación.** Frontend en Vercel, backend en Render (free tier), variables de entorno de producción. README en cada repo con capturas y link a la demo en vivo. Publicar en LinkedIn/GitHub como parte del portafolio.

## Notas de contexto

- Jonta también está en búsqueda activa de empleo remoto (ver tarea de LinkedIn) — este proyecto es parte de su portafolio para esas aplicaciones.
- Decisiones ya tomadas: JWT guardado en localStorage por simplicidad (se explicó el trade-off vs. cookies httpOnly, no se implementó httpOnly por ahora). Next.js actualizado a la última versión por una vulnerabilidad conocida en 14.2.5.

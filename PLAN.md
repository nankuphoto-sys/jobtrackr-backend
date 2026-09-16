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

5. **Fase 4 — Pulido.** ✅ Completada.
   - Manejo de errores: se separó el error de carga inicial (bloqueaba y ocultaba todo el tablero — bug real) del error de una acción puntual (cambiar estado/borrar), que ahora se muestra como banner cerrable sin tapar el tablero. La carga inicial fallida ahora tiene botón "Reintentar".
   - Accesibilidad: el `KeyboardSensor` de dnd-kit ya daba foco y anuncios de fábrica, pero el salto por defecto era de 25px por flecha (~12 pulsaciones para cruzar una columna de 288px) — se reemplazó por un `coordinateGetter` a medida que salta directo a la columna vecina. Los anuncios y las instrucciones para lectores de pantalla, en inglés por defecto, se tradujeron y ahora mencionan la empresa real en vez de un id. Contraste de color auditado con cálculo real de WCAG (no a ojo): dos textos (`gray-400`, `red-500`) no llegaban a AA y se ajustaron.
   - QA en mobile real: las 6 pantallas revisadas a 375px con Chrome real vía Playwright, sin errores de consola ni de layout.
   - Tests e2e nuevos para blindar estos fixes (no solo "se ve bien", sino que el mecanismo funciona): retry tras error de carga, banner de error no oculta el tablero, y drag por teclado con una sola flecha por columna.

6. **Fase 5 — Deploy + documentación.** ✅ Desplegado y documentado (falta solo publicar el link en LinkedIn, que le corresponde a Jonta).
   - Backend en Render (Web Service, plan Free), conectado a GitHub para auto-deploy: https://jobtrackr-backend-ul8d.onrender.com
   - Frontend en Vercel (mismo auto-deploy vía GitHub): https://jobtrackr-frontend-two.vercel.app
   - Variables de entorno de producción separadas de desarrollo: `JWT_SECRET` nuevo (no se reutilizó el de dev), `FRONTEND_URL` restringe CORS del backend al dominio real de Vercel (antes aceptaba cualquier origen).
   - Se aprovechó para resolver una vulnerabilidad crítica real encontrada en el camino: `bcrypt@5.1.1` dependía de una versión vulnerable de `node-tar` (vía `node-pre-gyp`); `bcrypt@6.0.0` eliminó esa dependencia de raíz.
   - Flujo completo (registro → tablero → crear/editar/borrar) verificado con Playwright contra la app real en producción, no solo en local — incluyendo que el CORS restringido no rompió nada.
   - README de cada repo actualizado con el link a la demo, capturas de pantalla, y cómo está configurado el deploy.

7. **Pulido post-Fase 5 — Tests del backend.** ✅ Completado. El backend no tenía ningún test automatizado (solo verificación manual), asimétrico con la cobertura completa del frontend. 19 tests de integración (Vitest + Supertest) contra la app real y una base de datos real: CRUD completo, validaciones, y aislamiento entre usuarios (que un usuario no pueda leer/editar/borrar postulaciones ajenas). `src/app.ts` se separó de `src/index.ts` para poder testear la app sin levantar un puerto. Corren también en CI, antes del smoke-test de `/health`.

## Notas de contexto

- Jonta también está en búsqueda activa de empleo remoto (ver tarea de LinkedIn) — este proyecto es parte de su portafolio para esas aplicaciones.
- Decisiones ya tomadas: JWT guardado en localStorage por simplicidad (se explicó el trade-off vs. cookies httpOnly, no se implementó httpOnly por ahora). Next.js actualizado a la última versión por una vulnerabilidad conocida en 14.2.5.

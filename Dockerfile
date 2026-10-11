# Imagen de producción del backend de JobTrackr.
# Dos etapas: en "build" se instalan todas las dependencias y se compila TypeScript;
# la imagen final solo lleva lo necesario para correr, así queda más liviana y con menos superficie de ataque.

# ---------- Etapa 1: compilar ----------
FROM node:24-bookworm-slim AS build
WORKDIR /app

# Prisma necesita OpenSSL para su motor de consultas. apt-get clean + borrar los índices deja la capa más liviana.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && apt-get clean && find /var/lib/apt/lists -type f -delete

# Primero solo los manifiestos: si el código cambia pero las dependencias no,
# Docker reutiliza esta capa de la caché y no vuelve a correr npm ci.
COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
# "build" corre prisma generate (cliente para Linux) y compila a dist/.
RUN npm run build

# Deja en node_modules solo las dependencias de producción (el cliente de Prisma ya generado se conserva).
RUN npm prune --omit=dev

# ---------- Etapa 2: imagen final ----------
FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && apt-get clean && find /var/lib/apt/lists -type f -delete

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

# No correr como root dentro del contenedor.
USER node

EXPOSE 4000
# Healthcheck con Node (la imagen slim no trae curl).
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Aplica las migraciones pendientes y arranca el servidor.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]

# syntax=docker/dockerfile:1

# Imagen de la app de facturación recurrente.
#
#   docker build -t facturacion .
#   docker run --rm -p 3000:3000 \
#     -e DATABASE_URL=postgresql://usuario:clave@host:5432/invoices \
#     -e CRON_SECRET=... facturacion
#
# El contenedor aplica las migraciones pendientes al arrancar y luego sirve la
# app. Con RUN_MIGRATIONS=false se omite ese paso.
#
# La compilación no necesita base de datos: el acceso a Postgres es diferido
# (ver lib/db/index.ts), así que no hay que pasar credenciales al build.

# Debe coincidir con el campo packageManager de package.json.
ARG PNPM_VERSION=11
ARG NODE_VERSION=24

# ------------------------------------------------------------------ #
# Base de compilación: imagen oficial de pnpm
# ------------------------------------------------------------------ #
# ghcr.io/pnpm/pnpm es la imagen que recomienda pnpm: Debian slim con el
# binario autónomo de pnpm y sin Node, así que la versión de Node se elige
# aquí (`pnpm runtime set`) en vez de heredarla de la imagen base. Sustituye a
# corepack, que pnpm ya no recomienda.
FROM ghcr.io/pnpm/pnpm:${PNPM_VERSION} AS base

ARG NODE_VERSION
ENV NEXT_TELEMETRY_DISABLED=1

# Deja `node` en /pnpm/bin, que la imagen ya tiene en el PATH.
RUN pnpm runtime set node ${NODE_VERSION} -g

WORKDIR /app

# ------------------------------------------------------------------ #
# Dependencias
# ------------------------------------------------------------------ #
FROM base AS deps

# Solo los manifiestos: así esta capa se reutiliza mientras no cambien.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Incluye las de desarrollo porque hacen falta para compilar (TypeScript,
# Tailwind) y para empaquetar el migrador (esbuild).
# El store va a una ruta propia (y no al /pnpm/store por omisión) porque el
# montaje de caché taparía el Node que `pnpm runtime set` dejó ahí.
RUN --mount=type=cache,id=pnpm,target=/pnpm-store \
    pnpm install --frozen-lockfile --store-dir=/pnpm-store

# ------------------------------------------------------------------ #
# Compilación
# ------------------------------------------------------------------ #
FROM base AS build

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm build

# El migrador se empaqueta en un solo archivo con sus dependencias dentro.
# Hace falta porque la salida `standalone` de Next mete las dependencias en el
# bundle del servidor y deja node_modules con solo next y react, así que un
# script suelto no podría importar drizzle-orm ni postgres.
RUN pnpm build:migrator

# ------------------------------------------------------------------ #
# Runtime
# ------------------------------------------------------------------ #
# En ejecución no se usa pnpm (solo `node`), así que basta una imagen de Node.
# `trixie-slim` es la misma versión de Debian que la imagen de pnpm, para que
# los binarios nativos que se copian encuentren la misma glibc.
FROM node:${NODE_VERSION}-trixie-slim AS runner

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

WORKDIR /app

# `standalone` ya trae el servidor y sus dependencias; los estáticos y public
# van aparte porque Next no los incluye ahí. El usuario `node` sin privilegios
# viene en la imagen: el proceso no necesita root para servir HTTP.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

# Migraciones: el script empaquetado y los .sql con su journal.
COPY --from=build --chown=node:node /app/.next/migrate.mjs ./migrate.mjs
COPY --chown=node:node drizzle ./drizzle
COPY --chmod=0755 docker/entrypoint.sh ./entrypoint.sh

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "server.js"]

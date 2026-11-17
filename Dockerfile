# syntax=docker/dockerfile:1

# --- 1) Compilación del frontend (Vue) ---------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY shared shared
COPY client client
RUN npm run build

# --- 2) Dependencias de producción del servidor ------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev --workspace server --workspace shared --include-workspace-root

# --- 3) Imagen final ---------------------------------------------------------
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    CLIENT_DIST_DIR=/app/client/dist
WORKDIR /app

COPY --from=deps /app/node_modules node_modules
COPY package.json ./
COPY shared shared
COPY server server
COPY --from=build /app/client/dist client/dist

# Directorio de datos persistente (montar un volumen aquí), propiedad del usuario sin privilegios.
# Sin instrucción VOLUME: algunas plataformas (Railway) la rechazan; el volumen se monta desde fuera.
RUN mkdir -p /data && chown -R node:node /data
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" || exit 1

CMD ["node", "server/src/index.js"]

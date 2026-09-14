# North Padel — imagen única: API + WebSocket + cliente estático
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# curl: lo usa el healthcheck de Coolify (GET /api/health dentro del contenedor)
RUN apk add --no-cache curl && corepack enable && corepack prepare pnpm@11 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist
# PGlite (solo si no hay DATABASE_URL) persiste acá
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["node", "dist/server/index.js"]

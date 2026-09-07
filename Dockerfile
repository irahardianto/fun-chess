# ============================================================
# Stage 1: Build stage (compile TypeScript & bundle Vue PWA)
# ============================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Enable Corepack and activate pnpm
ENV CI=true
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy root and workspace package manifests for caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY shared/package.json ./shared/
COPY apps/server/package.json ./apps/server/
COPY apps/client/package.json ./apps/client/
COPY apps/e2e/package.json ./apps/e2e/

# Install full dependencies across all workspaces
RUN pnpm install --frozen-lockfile

# Copy root tsconfig and workspace sources / configs
COPY tsconfig.base.json ./
COPY shared/ ./shared/
COPY apps/server/ ./apps/server/
COPY apps/client/ ./apps/client/

# Compile all workspaces (shared -> server, client)
RUN pnpm run build

# Deploy server with production dependencies isolated and resolved
RUN pnpm --filter @fun-chess/server --prod deploy /app/pruned-server

# ============================================================
# Stage 2: Production runner stage (minimal, secure, non-root)
# ============================================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy isolated server deployment and client static bundle
COPY --chown=node:node --from=builder /app/pruned-server ./apps/server
COPY --chown=node:node --from=builder /app/apps/client/dist ./apps/client/dist

# Security: Run as non-root built-in 'node' user
USER node

# Container listening port
EXPOSE 3000

# Container healthcheck probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3000}/healthz || exit 1

# Start Fun Chess unified server (API + WebSocket relay + static SPA hosting)
CMD ["node", "apps/server/dist/index.js"]


# ============================================================
# Stage 1: Build stage (compile TypeScript & bundle Vue PWA)
# ============================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root and workspace package manifests for caching
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY apps/server/package.json ./apps/server/
COPY apps/client/package.json ./apps/client/

# Install full dependencies across all workspaces
RUN npm ci

# Copy root tsconfig and workspace sources / configs
COPY tsconfig.base.json ./
COPY shared/ ./shared/
COPY apps/server/ ./apps/server/
COPY apps/client/ ./apps/client/

# Clean any host node_modules that might have been copied from local workspace
RUN rm -rf shared/node_modules apps/server/node_modules apps/client/node_modules

# Compile all workspaces (shared -> server, client)
RUN npm run build

# Remove development dependencies to minimize production image footprint
RUN npm prune --omit=dev

# ============================================================
# Stage 2: Production runner stage (minimal, secure, non-root)
# ============================================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy workspace package manifests
COPY --chown=node:node package.json ./
COPY --chown=node:node shared/package.json ./shared/
COPY --chown=node:node apps/server/package.json ./apps/server/
COPY --chown=node:node apps/client/package.json ./apps/client/

# Copy pruned production node_modules from builder
COPY --chown=node:node --from=builder /app/node_modules ./node_modules

# Copy compiled production artifacts
COPY --chown=node:node --from=builder /app/shared/dist ./shared/dist
COPY --chown=node:node --from=builder /app/apps/server/dist ./apps/server/dist
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

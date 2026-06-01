# Stage 1: Dependencies
FROM node:20-alpine AS deps

WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --only=production && \
    npx prisma generate

#Stage 2: Builder
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig*.json ./
COPY prisma ./prisma/

RUN npm ci

COPY src ./src/

RUN npm run build && \
    npx prisma generate

# Stage 3: Production
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S appuser -u 1001 -G nodejs

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init curl

# Copy production dependencies
COPY --from=deps --chown=appuser:nodejs /app/node_modules ./node_modules
COPY --from=deps --chown=appuser:nodejs /app/prisma ./prisma

# Copy built application
COPY --from=builder --chown=appuser:nodejs /app/dist ./dist
COPY --from=builder --chown=appuser:nodejs /app/package.json ./

# Create uploads directory
RUN mkdir -p /app/uploads && \
    chown -R appuser:nodejs /app/uploads

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/health/live || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
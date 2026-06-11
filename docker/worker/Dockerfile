FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
COPY prisma ./prisma/
RUN apk add --no-cache openssl \
    && npm ci --omit=dev \
    && npx prisma generate

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY tsconfig*.json ./
COPY prisma ./prisma/
RUN npm ci
COPY src ./src/
RUN npm run build && npx prisma generate

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -g 1001 -S nodejs && \
    adduser -S worker -u 1001 -G nodejs

RUN apk add --no-cache dumb-init

COPY --from=deps --chown=worker:nodejs /app/node_modules ./node_modules
COPY --from=deps --chown=worker:nodejs /app/prisma ./prisma
COPY --from=builder --chown=worker:nodejs /app/dist ./dist
COPY --from=builder --chown=worker:nodejs /app/package.json ./

USER worker

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/worker.js"]
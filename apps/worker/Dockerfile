FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/worker/package.json ./apps/worker/

RUN npm install --legacy-peer-deps

COPY packages/shared/ ./packages/shared/
COPY apps/worker/ ./apps/worker/

RUN cd apps/worker && npx tsc

FROM node:22-alpine AS production

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/packages/shared ./packages/shared
COPY apps/worker/package.json ./apps/worker/

CMD ["node", "apps/worker/dist/worker.js"]

FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

RUN npm install --legacy-peer-deps

COPY packages/shared/ ./packages/shared/
COPY apps/api/ ./apps/api/

RUN cd apps/api && npx tsc

FROM node:22-alpine AS production

WORKDIR /app

COPY package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages/shared ./packages/shared

EXPOSE 4000

CMD ["node", "apps/api/dist/server.js"]

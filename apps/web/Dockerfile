FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

RUN npm install --legacy-peer-deps

COPY packages/shared/ ./packages/shared/
COPY apps/web/ ./apps/web/

RUN cd apps/web && npx next build

FROM node:22-alpine AS production

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/apps/web/package.json ./apps/web/
COPY --from=builder /app/apps/web/next.config.js ./apps/web/

EXPOSE 3000

WORKDIR /app/apps/web

CMD ["node", "../../node_modules/.bin/next", "start", "--port", "3000"]

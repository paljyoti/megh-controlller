# build stage
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
RUN npm ci

COPY . .

RUN npx prisma generate
RUN npm run build

# runtime stage
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup -S app && adduser -S app -G app

# install wget for healthcheck
RUN apk add --no-cache wget

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/certs ./certs

RUN chown -R app:app /app

USER app

EXPOSE 8082

HEALTHCHECK --interval=30s --timeout=5s CMD wget -q --spider http://localhost:8082/health || exit 1

CMD ["sh","-c","npx prisma migrate deploy && node dist/index.js"]

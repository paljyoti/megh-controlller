# build stage
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
RUN npm ci

COPY . .

RUN npm config set fetch-retries=5 && npm config set fetch-retry-mintimeout=2000 && npm config set fetch-retry-maxtimeout=120000
RUN set -eux; \
		for i in 1 2 3 4 5; do \
			npx prisma generate && break || true; \
			echo "prisma generate failed, retrying ($i)"; \
			sleep 2; \
		done
RUN npm run build

# runtime stage
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup -S app && adduser -S app -G app

# install wget for healthcheck (retry to handle transient DNS/APKINDEX failures)
RUN set -eux; \
		apk update || true; \
		for i in 1 2 3 4 5; do \
			apk add --no-cache wget && break || true; \
			sleep 2; \
		done; \
		apk cache clean || true

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/certs ./certs

RUN chown -R app:app /app

USER app

EXPOSE 8082

HEALTHCHECK --interval=30s --timeout=5s CMD wget -q --spider http://localhost:8082/health || exit 1

CMD ["sh","-c","npx prisma migrate deploy && npx prisma db seed && node dist/index.js"]

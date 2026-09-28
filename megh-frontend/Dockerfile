
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./

# Ensure devDependencies (like TypeScript) are installed for the build
RUN npm ci --include=dev

COPY . .

# Received from docker-compose.yml's build.args — baked into the static bundle by Vite at
# build time (import.meta.env.VITE_API_BASE_URL). Not set locally, so local dev/builds keep
# using api.ts's existing window.location.hostname fallback.
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

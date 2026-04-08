FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS build
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile=false

RUN pnpm --filter web build

FROM nginxinc/nginx-unprivileged:stable-alpine AS production
# Copy static files to nginx html directory
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

# Add custom nginx config for SPA fallback routes
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

# env-config.js is mounted as a ConfigMap in K8s at /usr/share/nginx/html/env-config.js

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
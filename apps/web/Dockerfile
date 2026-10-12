# syntax=docker/dockerfile:1.7

# Multi-stage build for the SPA.
#
# The production image is nginx serving static assets — no Node at runtime.
# VITE_API_URL is a BUILD argument, not a runtime env var, because Vite inlines
# it into the bundle. In the prod-like stack it is left empty so the SPA calls
# the same origin and nginx proxies /api to the backend (no CORS in production).

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm-slim AS deps
ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
# Point the store AT the BuildKit cache mount below. Without this, pnpm chooses
# its own location and the cache mount does nothing.
ENV PNPM_STORE_DIR=/pnpm/store
# pnpm refuses to purge node_modules without a TTY unless CI is set.
ENV CI=true
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/testing/package.json packages/testing/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY e2e/package.json e2e/

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @kit/web... --filter @kit/contracts

FROM deps AS build
WORKDIR /repo
ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}

COPY tsconfig.base.json tsconfig.json ./
COPY packages/contracts packages/contracts
COPY apps/web apps/web

RUN pnpm --filter @kit/contracts run build \
    && pnpm --filter @kit/web run build

FROM nginx:1.29-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html

EXPOSE 80

# syntax=docker/dockerfile:1.7

# Multi-stage build for the SPA.
#
# The production image is nginx serving static assets — no Node at runtime.

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
COPY apps/web/package.json apps/web/
COPY e2e/package.json e2e/

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @ghd/web...

FROM deps AS build
WORKDIR /repo

COPY tsconfig.base.json tsconfig.json ./
COPY apps/web apps/web

RUN pnpm --filter @ghd/web run build

FROM nginx:1.29-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html

EXPOSE 80

# syntax=docker/dockerfile:1.7

# Multi-stage build for the API.
#
# Final image is distroless and runs as a non-root user: no shell, no package
# manager, minimal CVE surface. If you need to debug inside the container, use
# the `build` stage rather than weakening this one.

ARG NODE_VERSION=24

# ---------------------------------------------------------------------------
# deps — install workspace dependencies with a cached pnpm store
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-trixie-slim AS deps
ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
# Point the store AT the BuildKit cache mount below. Without this, pnpm chooses
# its own location and the cache mount does nothing.
ENV PNPM_STORE_DIR=/pnpm/store
# pnpm refuses to purge node_modules without a TTY unless CI is set.
ENV CI=true
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate
WORKDIR /repo

# Copy only manifests first so this layer caches until dependencies change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/testing/package.json packages/testing/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY e2e/package.json e2e/

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @kit/api... --filter @kit/contracts

# ---------------------------------------------------------------------------
# build — compile TypeScript to dist/
# ---------------------------------------------------------------------------
FROM deps AS build
WORKDIR /repo
COPY tsconfig.base.json tsconfig.json ./
COPY packages/contracts packages/contracts
COPY apps/api apps/api

RUN pnpm --filter @kit/contracts run build \
    && pnpm --filter @kit/api run build

# Strip dev dependencies so only runtime deps are copied into the final image.
# `install --prod` only relinks: packages already in node_modules/.pnpm stay put
# (and dev tools ship Go binaries Trivy flags), so start from empty node_modules.
# --ignore-scripts: no runtime dependency needs a build step, and skipping them
# removes an arbitrary-code-execution surface from the image build.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    rm -rf node_modules apps/*/node_modules packages/*/node_modules e2e/node_modules \
    && pnpm install --frozen-lockfile --prod --ignore-scripts \
      --filter @kit/api... --filter @kit/contracts

# ---------------------------------------------------------------------------
# runtime — distroless, non-root
# ---------------------------------------------------------------------------
FROM gcr.io/distroless/nodejs${NODE_VERSION}-debian13:nonroot AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /repo/node_modules /app/node_modules
COPY --from=build /repo/packages/contracts/dist /app/packages/contracts/dist
COPY --from=build /repo/packages/contracts/package.json /app/packages/contracts/
COPY --from=build /repo/packages/contracts/node_modules /app/packages/contracts/node_modules
COPY --from=build /repo/apps/api/dist /app/apps/api/dist
COPY --from=build /repo/apps/api/drizzle /app/apps/api/drizzle
COPY --from=build /repo/apps/api/package.json /app/apps/api/
COPY --from=build /repo/apps/api/node_modules /app/apps/api/node_modules

USER nonroot
EXPOSE 3000

# distroless's entrypoint is already `node`, so CMD is just the script path.
CMD ["/app/apps/api/dist/main.js"]

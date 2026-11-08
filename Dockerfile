# syntax=docker/dockerfile:1.7
#
# Multi-stage build → Next.js standalone server.
#   deps    — install node_modules from the lockfile (cached by lockfile hash)
#   builder — `next build` (needs ~8 GB RAM; see NODE_OPTIONS in package.json)
#   runner  — minimal runtime: .next/standalone + static assets, non-root
#
# NEXT_PUBLIC_* are inlined into the client bundle at build time, so they
# are build args, not runtime env. Everything secret is runtime-only
# (Kubernetes Secret) and never enters an image layer.

ARG NODE_VERSION=22-bookworm-slim
ARG PNPM_VERSION=10.34.6

FROM node:${NODE_VERSION} AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app

# ── deps ────────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

# ── builder ─────────────────────────────────────────────────────────────
FROM base AS builder
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_PRODUCTION_URL
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    NEXT_PUBLIC_PRODUCTION_URL=${NEXT_PUBLIC_PRODUCTION_URL}
# Build-only placeholders: some modules construct SDK clients at import
# time (Resend throws on a missing key; better-auth refuses to start
# without a secret in production), and `next build` imports every route
# while collecting page data. These values exist only in this stage —
# the runner stage gets real ones from the Kubernetes Secret.
ENV RESEND_API_KEY=re_build_placeholder \
    BETTER_AUTH_SECRET=build-placeholder-secret-not-used-at-runtime \
    DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# ── runner ──────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app

RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]

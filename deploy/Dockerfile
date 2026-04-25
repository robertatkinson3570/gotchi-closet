FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 build-essential \
  && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml ./
# pnpm 10 ignores build scripts by default — rebuild native modules (better-sqlite3)
RUN corepack enable \
  && pnpm install --frozen-lockfile \
  && pnpm rebuild better-sqlite3

FROM node:20-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    tini \
  && rm -rf /var/lib/apt/lists/* \
  && useradd -m -u 1001 gotchicloset
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=gotchicloset:gotchicloset . .
RUN mkdir -p /srv/gotchicloset/data && chown -R gotchicloset:gotchicloset /srv/gotchicloset
USER gotchicloset
ENV NODE_ENV=production
EXPOSE 8787
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "node_modules/tsx/dist/cli.mjs", "server/index.ts"]

FROM node:22-slim

WORKDIR /app
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends curl python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

ARG TG_AUTH_TOKEN
ENV TG_AUTH_TOKEN=${TG_AUTH_TOKEN}

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @tpc/web build

ENV NODE_ENV=production
ENV DB_PATH=/data/tpc.db
ENV PORT=3000
ENV TPC_CLI_AGENT=off
EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD curl -fsS http://localhost:3000/api/health || exit 1

CMD ["pnpm", "--filter", "@tpc/server", "start"]

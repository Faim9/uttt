# The whole site in one image: the Node server, which also serves the built web app.
# Built from the repository root: docker build -f deploy/Dockerfile .

FROM node:22-bookworm-slim AS base
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/

FROM base AS build
RUN pnpm install --frozen-lockfile
COPY packages packages
RUN pnpm --filter @uttt/web build

FROM base
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATABASE_PATH=/data/uttt.db
RUN pnpm install --prod --frozen-lockfile --filter @uttt/server... \
  && mkdir /data && chown node:node /data
COPY packages/core/src packages/core/src
COPY packages/server/src packages/server/src
COPY packages/server/drizzle packages/server/drizzle
COPY --from=build /app/packages/web/build packages/web/build
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "packages/server/src/main.ts"]

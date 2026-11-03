# SnapRAID bundled in the image; override with SNAPRAID_BIN to use a mounted binary
FROM docker.io/library/debian:bookworm-slim AS snapraid-builder

ARG SNAPRAID_VERSION=15.1
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl gcc make libc6-dev \
  && curl -fsSL "https://github.com/amadvance/snapraid/releases/download/v${SNAPRAID_VERSION}/snapraid-${SNAPRAID_VERSION}.tar.gz" \
    | tar -xz -C /tmp \
  && cd /tmp/snapraid-${SNAPRAID_VERSION} \
  && ./configure && make -j"$(nproc)" \
  && install -m 0755 snapraid /usr/local/bin/snapraid

# The Bun of packageManager in package.json (Renovate moves them together)
FROM docker.io/oven/bun:1.4.4-slim AS workspace

WORKDIR /app

# The workspace's manifests: one bun.lock for all packages, installed per package below; the
# compiler options the packages' tsconfig.json extend (Vite and Bun read them for @shared/)
COPY package.json bun.lock bunfig.toml tsconfig.base.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY e2e/package.json e2e/

FROM workspace AS backend-builder

# The backend's packages without the tools for types and tests (the isolated linker keeps them
# in /app/node_modules/.bun, linked from apps/server/node_modules); tsconfig.json maps @shared/
# to the workspace package @snapraid-ui/shared
RUN bun install --frozen-lockfile --production --filter ./apps/server

COPY apps/server/tsconfig.json apps/server/
COPY apps/server/src/ apps/server/src/

FROM workspace AS frontend-builder

RUN bun install --frozen-lockfile --filter ./apps/web

COPY packages/shared/ packages/shared/
COPY apps/web/ apps/web/
WORKDIR /app/apps/web
RUN bun run build

# Final image: one Bun process serves the UI, the API and the WebSocket on port 80
FROM docker.io/oven/bun:1.4.4-slim

# smartmontools: SnapRAID calls smartctl for smart, probe (power state) and down (spin down);
# tini runs as PID 1 (the Bun image has none of its own)
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl smartmontools tini \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /app/snapraid

COPY --from=snapraid-builder /usr/local/bin/snapraid /usr/local/bin/snapraid

COPY --from=backend-builder /app/tsconfig.base.json /app/tsconfig.base.json
COPY --from=backend-builder /app/node_modules /app/node_modules
COPY --from=backend-builder /app/apps/server /app/apps/server
COPY packages/shared/ /app/packages/shared/
# The backend loads the frontend's server from here (apps/server/src/frontend.ts)
COPY --from=frontend-builder /app/apps/web/.output /app/apps/web/.output
# The version, which the backend reads from it (apps/server/src/version.ts)
COPY apps/web/package.json /app/apps/web/package.json
# The documentation, which the MCP endpoint offers to AI agents
COPY docs/*.md /app/docs/

ENV SNAPRAID_BASE_PATH=/app/snapraid \
    SNAPRAID_BIN=/usr/local/bin/snapraid \
    PORT=80
VOLUME /app/snapraid

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost/api/health || exit 1

WORKDIR /app/apps/server
# tini as PID 1 passes docker stop's SIGTERM on to Bun and reaps the processes it starts
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["bun", "src/main.ts"]

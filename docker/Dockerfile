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

# The Bun of packageManager in backend/ and frontend/package.json (Renovate moves them together)
FROM docker.io/oven/bun:1.4.4-slim AS backend-builder

WORKDIR /app/backend

# The backend's packages without the tools for types and tests; tsconfig.json maps @shared/
COPY backend/package.json backend/bun.lock backend/tsconfig.json ./
RUN bun install --frozen-lockfile --production

COPY backend/src/ ./src/

FROM docker.io/oven/bun:1.4.4-slim AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package.json frontend/bun.lock ./
RUN bun install --frozen-lockfile

COPY shared/ ../shared/
COPY frontend/ ./
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

COPY --from=backend-builder /app/backend /app/backend
COPY shared/ /app/shared/
# The backend loads the frontend's server from here (backend/src/frontend.ts)
COPY --from=frontend-builder /app/frontend/.output /app/frontend/.output
# The version, which the backend reads from it (backend/src/version.ts)
COPY frontend/package.json /app/frontend/package.json
# The documentation, which the MCP endpoint offers to AI agents
COPY docs/*.md /app/docs/

ENV SNAPRAID_BASE_PATH=/app/snapraid \
    SNAPRAID_BIN=/usr/local/bin/snapraid \
    PORT=80
VOLUME /app/snapraid

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost/api/health || exit 1

WORKDIR /app/backend
# tini as PID 1 passes docker stop's SIGTERM on to Bun and reaps the processes it starts
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["bun", "src/main.ts"]

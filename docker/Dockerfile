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

FROM docker.io/denoland/deno:2.9.8 AS backend-builder

WORKDIR /app/backend

# Cache dependencies (DENO_DIR=/deno-dir, copied into the final image)
COPY backend/deno.json backend/deno.lock ./
COPY shared/ ../shared/
RUN deno install --entrypoint deno.json

# Copy backend application code and warm the module cache
COPY backend/src/ ./src/
RUN deno cache src/main.ts

FROM docker.io/library/node:22-bookworm-slim AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY shared/ ../shared/
COPY frontend/ ./
RUN npm run build

# Final image: one Deno process serves the UI, the API and the WebSocket on port 80
FROM docker.io/denoland/deno:2.9.8

# smartmontools: SnapRAID calls smartctl for smart, probe (power state) and down (spin down)
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl smartmontools \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /app/snapraid

COPY --from=snapraid-builder /usr/local/bin/snapraid /usr/local/bin/snapraid

COPY --from=backend-builder /deno-dir /deno-dir
COPY --from=backend-builder /app/backend /app/backend
COPY --from=backend-builder /app/shared /app/shared
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
# tini as PID 1 passes docker stop's SIGTERM on to Deno and reaps the processes it starts
ENTRYPOINT ["/tini", "--"]
CMD ["deno", "run", "--allow-net", "--allow-read", "--allow-write", "--allow-run", "--allow-env", "--allow-sys=networkInterfaces,hostname", "src/main.ts"]

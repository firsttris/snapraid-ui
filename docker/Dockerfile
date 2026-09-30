# SnapRAID bundled in the image; override with SNAPRAID_BIN to use a mounted binary
FROM docker.io/library/debian:bookworm-slim AS snapraid-builder

ARG SNAPRAID_VERSION=14.9
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl gcc make libc6-dev \
  && curl -fsSL "https://github.com/amadvance/snapraid/releases/download/v${SNAPRAID_VERSION}/snapraid-${SNAPRAID_VERSION}.tar.gz" \
    | tar -xz -C /tmp \
  && cd /tmp/snapraid-${SNAPRAID_VERSION} \
  && ./configure && make -j"$(nproc)" \
  && install -m 0755 snapraid /usr/local/bin/snapraid

FROM docker.io/denoland/deno:2.5.6 AS backend-builder

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

# Final combined image
FROM docker.io/denoland/deno:2.5.6

# smartmontools: SnapRAID calls smartctl for smart, probe (power state) and down (spin down)
RUN apt-get update \
  && apt-get install -y --no-install-recommends nginx supervisor curl smartmontools \
  && rm -rf /var/lib/apt/lists/* \
  && rm -f /etc/nginx/sites-enabled/default \
  && mkdir -p /app/snapraid /var/log/supervisor /run/nginx

COPY --from=snapraid-builder /usr/local/bin/snapraid /usr/local/bin/snapraid

# Node runtime for the frontend server
COPY --from=frontend-builder /usr/local/bin/node /usr/local/bin/node

COPY --from=backend-builder /deno-dir /deno-dir
COPY --from=backend-builder /app/backend /app/backend
COPY --from=backend-builder /app/shared /app/shared
COPY --from=frontend-builder /app/frontend/.output /app/frontend/.output

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/supervisord.conf /etc/supervisord.conf
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV SNAPRAID_BASE_PATH=/app/snapraid \
    SNAPRAID_BIN=/usr/local/bin/snapraid
VOLUME /app/snapraid

EXPOSE 80 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost/ || exit 1

ENTRYPOINT ["/entrypoint.sh"]

# Build everything in one image (standalone version)
FROM denoland/deno:2.1.4 AS backend-builder

WORKDIR /app/backend

# Cache dependencies
COPY backend/deno.json .
COPY shared/ ../shared/
RUN deno install --entrypoint deno.json

# Copy backend application code
COPY backend/src/ ./src/
COPY backend/schedules.json ./schedules.json

FROM node:22-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy package files
COPY frontend/package.json frontend/package-lock.json* ./

# Install dependencies
RUN npm ci

# Copy application code
COPY frontend/ ./

# Build the application
RUN npm run build

# Final combined image
FROM alpine:latest

# Install nginx and supervisor
RUN apk add --no-cache nginx supervisor curl

# Install Deno runtime
RUN curl -fsSL https://deno.land/install.sh | sh && mv /root/.deno/bin/deno /usr/local/bin/

# Create directories
RUN mkdir -p /app/backend /app/frontend /var/log/supervisor /run/nginx

# Copy backend from builder
COPY --from=backend-builder /app/backend /app/backend

# Copy frontend build
COPY --from=frontend-builder /app/frontend/dist /app/frontend

# Copy nginx configuration
COPY docker/nginx.conf /etc/nginx/http.d/default.conf

# Copy supervisor configuration
COPY docker/supervisord.conf /etc/supervisord.conf

# Copy entrypoint script
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose ports
EXPOSE 80 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/ || exit 1

# Start services
ENTRYPOINT ["/entrypoint.sh"]

# Build everything in one image (standalone version)
FROM denoland/deno:2.5.6 AS backend-builder

WORKDIR /app/backend

# Cache dependencies
COPY backend/deno.json .
COPY shared/ ../shared/
RUN deno install --entrypoint deno.json

# Copy backend application code
COPY backend/src/ ./src/

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
FROM denoland/deno:latest

# Install nginx and supervisor
RUN apt-get update && apt-get install -y nginx supervisor nodejs libgcc-s1 && rm -rf /var/lib/apt/lists/*

# Create directories
RUN mkdir -p /app/backend /app/frontend /app/snapraid /var/log/supervisor /run/nginx

# Copy backend from builder
COPY --from=backend-builder /app/backend /app/backend

# Copy frontend build
COPY --from=frontend-builder /app/frontend/.output /app/frontend/.output

# Copy nginx configuration
COPY docker/nginx.conf /etc/nginx/sites-available/default

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

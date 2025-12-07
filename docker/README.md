# SnapRAID Docker Setup

This Docker setup allows you to run the SnapRAID application in a container. It includes a backend (written in Deno), a frontend (built with Vite), and an Nginx web server as a reverse proxy.

## Overview

The setup builds a Docker image that:
- Serves the SnapRAID backend on port 8080
- Hosts the frontend on port 80 (internally) and 3000 (externally)
- Uses Nginx as a reverse proxy
- Uses Supervisor for process management

## Prerequisites

- Docker and Docker Compose installed
- SnapRAID installed on the host system (the container mounts the binary)
- Access to SnapRAID configuration files and data disks

## Installation and Execution

1. **Clone the repository or navigate to the project directory:**
   ```
   cd /home/tristan/Projects/snapraid
   ```

2. **Build the Docker image and start the container:**
   ```
   docker-compose -f docker/docker-compose.yml up --build
   ```
   Or in the background:
   ```
   docker-compose -f docker/docker-compose.yml up --build -d
   ```

3. **Access the application:**
   - Frontend: http://localhost:3000
   - Backend API (optional): http://localhost:8080

## Configuration

### Adjusting Volumes

Edit the `docker/docker-compose.yml` to adjust the paths to your SnapRAID configurations and data disks:

```yaml
volumes:
  - /usr/bin/snapraid:/usr/bin/snapraid:ro
  - /path/to/snapraid.conf:/snapraid/snapraid.conf
  - /path/to/logs:/snapraid/logs
  - /path/to/schedules.json:/app/backend/schedules.json
  # Add your data and parity disks
  # - /mnt/disk1:/mnt/disk1:ro
  # - /mnt/disk1/SnapRAID.content:/mnt/disk1/SnapRAID.content
```

**Important:** Parity disks must be mounted writable. Content files must also be writable.

### Environment Variables

- `DENO_ENV=production`: Sets the Deno environment to production.

## Podman Quadlet Setup

Alternatively to Docker Compose, you can use Podman with Quadlet files to manage the container as a systemd service. This is useful for systems using systemd and desiring tighter integration.

### Prerequisites

- Podman installed
- systemd (for service management)
- SnapRAID installed on the host system

### Installation and Execution

1. **Build the image:**
   ```
   podman build -f docker/Dockerfile -t localhost/snapraid-app:latest ..
   ```

2. **Copy Quadlet files:**
   Copy `snapraid-app.container` and `snapraid-net.network` to the systemd directory:
   ```
   cp docker/snapraid-app.container ~/.config/containers/systemd/
   cp docker/snapraid-net.network ~/.config/containers/systemd/
   ```
   For system-wide installation, use `/etc/containers/systemd/` (requires root privileges).

3. **Adjust configuration:**
   Edit `~/.config/containers/systemd/snapraid-app.container` to adjust the volume paths to your SnapRAID configuration (similar to Docker Compose).

4. **Reload systemd and start the service:**
   ```
   systemctl --user daemon-reload
   systemctl --user start snapraid-app
   systemctl --user enable snapraid-app  # For automatic start on boot
   ```

5. **Access the application:**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8080

### Stopping and Disabling

```
systemctl --user stop snapraid-app
systemctl --user disable snapraid-app
```

### Viewing Logs

```
podman logs snapraid-app
# Or via journalctl
journalctl --user -u snapraid-app
```

## Files in the Docker Folder

- `docker-compose.yml`: Defines the Docker services and volumes.
- `Dockerfile`: Multi-stage build for backend, frontend, and final Alpine image.
- `nginx.conf`: Nginx configuration for reverse proxy.
- `supervisord.conf`: Supervisor configuration for process management.
- `entrypoint.sh`: Startup script for the container.
- `snapraid-app.container`: (Optional) systemd container configuration.
- `snapraid-net.network`: (Optional) Network configuration.

## Troubleshooting

- **Container does not start:** Check the logs with `docker-compose logs`.
- **Access denied to disks:** Ensure the container runs with `privileged: true` and paths are correct.
- **SnapRAID commands missing:** Ensure SnapRAID is installed on the host and the path in volumes is correct.
- **Healthcheck fails:** The container performs a healthcheck. Check if Nginx is running.

## Stopping and Cleanup

```
docker-compose -f docker/docker-compose.yml down
```

To also remove the volumes:
```
docker-compose -f docker/docker-compose.yml down -v
```
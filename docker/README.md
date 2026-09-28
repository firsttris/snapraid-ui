# Docker / Podman

Published image: [`tristanteu/snapraid-ui`](https://hub.docker.com/r/tristanteu/snapraid-ui) (amd64, arm64). See the [main README](../README.md) for usage and configuration.

## Files

| File | Purpose |
|---|---|
| `Dockerfile` | Multi-stage build: SnapRAID from source, Deno backend, TanStack Start frontend, Nginx + Supervisor runtime |
| `docker-compose.yml` | Compose setup using the published image (or `--build` to build from source) |
| `snapraid-app.container` | Podman Quadlet unit |
| `snapraid-net.network` | Podman Quadlet network |
| `nginx.conf` | Reverse proxy: `/` → frontend (3000), `/api` and `/ws` → backend (8080) |
| `supervisord.conf` | Runs backend, frontend and Nginx |

## Build from source

From the repository root:

```bash
docker build -f docker/Dockerfile -t snapraid-ui .
# pin another SnapRAID release
docker build -f docker/Dockerfile --build-arg SNAPRAID_VERSION=14.9 -t snapraid-ui .
```

## Podman Quadlet

```bash
mkdir -p ~/.config/containers/systemd ~/snapraid
cp docker/snapraid-app.container docker/snapraid-net.network ~/.config/containers/systemd/
# edit the Volume= lines for your disks
systemctl --user daemon-reload
systemctl --user start snapraid-app
```

For boot-time start, install into `/etc/containers/systemd/` and use `systemctl` without `--user`. Rootless Podman cannot read SMART data, so run it as root if you need that.

The unit sets `AutoUpdate=registry`, so `podman auto-update` pulls new releases.

Logs: `journalctl --user -u snapraid-app` or `podman logs snapraid-ui`.

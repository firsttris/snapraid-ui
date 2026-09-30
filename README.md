<div align="center">

# SnapRAID UI

**A modern web interface for [SnapRAID](https://www.snapraid.it/).**<br>
Run sync and scrub, schedule jobs and keep an eye on disk health, all from your browser.

[![CI](https://github.com/firsttris/snapraid-ui/actions/workflows/ci.yml/badge.svg)](https://github.com/firsttris/snapraid-ui/actions/workflows/ci.yml)
[![Docker Pulls](https://img.shields.io/docker/pulls/tristanteu/snapraid-ui?logo=docker&logoColor=white)](https://hub.docker.com/r/tristanteu/snapraid-ui)
[![Image Size](https://img.shields.io/docker/image-size/tristanteu/snapraid-ui/latest?logo=docker&logoColor=white&label=image)](https://hub.docker.com/r/tristanteu/snapraid-ui)
[![Platforms](https://img.shields.io/badge/platform-amd64%20%7C%20arm64-lightgrey)](https://hub.docker.com/r/tristanteu/snapraid-ui/tags)
[![SnapRAID](https://img.shields.io/badge/SnapRAID-14.x-2ea44f)](https://www.snapraid.it/)

<img src="docs/screenshot.png" alt="SnapRAID UI dashboard" width="900">

</div>

## ✨ Features

- **Array health at a glance**: last sync and scrub, scrub coverage, next scheduled job
- **One-click commands**: sync, scrub, status, diff, check, fix, with live output over WebSocket
- **Scheduler**: cron-based jobs, no crontab editing; a sync can run touch before and scrub after it as one nightly routine
- **Notifications** via ntfy push, e-mail or webhook (Discord, Slack, Home Assistant …) when a job fails, scrub finds damaged data, a scheduled sync is skipped or a disk shows SMART problems
- **Disk replacement wizard**: restores a failed data or parity disk step by step (`fix -d`, `check -a`, `sync`) and pauses scheduled jobs meanwhile
- **Disk overview**: usage, file counts, fragmentation and parity headroom per disk
- **SMART monitoring** and disk power state (active / standby)
- **Logs**: history of every run with full output
- **Config management**: edit multiple `snapraid.conf` files, excludes and pool settings
- **Login** via environment variables, no database needed
- **English and German UI**

## 🐳 Quick start with Docker

The image ships with SnapRAID 14.9, so nothing needs to be installed on the host.

```bash
docker run -d --name snapraid-ui \
  --privileged \
  -p 3000:80 \
  -e SNAPRAID_UI_USERNAME=admin \
  -e SNAPRAID_UI_PASSWORD=change-me \
  -v ./snapraid:/app/snapraid \
  -v /mnt/disk1:/mnt/disk1 \
  -v /mnt/disk2:/mnt/disk2 \
  -v /mnt/parity:/mnt/parity \
  tristanteu/snapraid-ui:latest
```

Open **http://localhost:3000** and add your `snapraid.conf` in *Manage Configurations*.

**Mount your disks at the same paths as on the host**, so the paths in `snapraid.conf` stay valid. Parity and content locations must be writable. `--privileged` is only needed for SMART data and the disk power state.

### Docker Compose

```bash
curl -O https://raw.githubusercontent.com/firsttris/snapraid-ui/master/docker/docker-compose.yml
# add your disks under volumes:, then
docker compose up -d
```

For Podman with systemd, use the Quadlet files in [docker/](docker/).

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `SNAPRAID_BASE_PATH` | `/app/snapraid` | Holds `config.json`, `schedules.json`, logs and your SnapRAID configs. Mount it as a volume. |
| `SNAPRAID_BIN` | `/usr/local/bin/snapraid` | SnapRAID binary. The bundled one is used unless you point this elsewhere. |
| `SNAPRAID_EXTRA_ARGS` | *(empty)* | Extra arguments for every SnapRAID call |
| `SNAPRAID_UI_USERNAME` | *(empty)* | Username for the login. The login is active once username and password are both set. |
| `SNAPRAID_UI_PASSWORD` | *(empty)* | Password for the login |
| `SNAPRAID_UI_SESSION_HOURS` | `168` | How long a login lasts (7 days by default) |

### Login

Set `SNAPRAID_UI_USERNAME` and `SNAPRAID_UI_PASSWORD` to protect the UI. No database is involved: the credentials come from the environment, and a login is a signed, HTTP-only session cookie. Without both variables the UI stays open as before, e.g. if you already run it behind an auth proxy; the backend logs a warning then.

- The key that signs sessions is stored in `SNAPRAID_BASE_PATH/.session-secret`, so logins survive restarts. Delete the file to log everyone out.
- Changing the password also ends all existing logins.
- After 5 failed attempts a client has to wait 15 minutes.
- The cookie is marked `Secure` when the request came in over HTTPS (`X-Forwarded-Proto: https` from your reverse proxy). Use HTTPS if the UI is reachable from outside your LAN.

**Using your own SnapRAID binary:** mount it and point `SNAPRAID_BIN` at it. It needs to be version 14.0 or newer, because the UI parses SnapRAID's structured log output.

```bash
  -v /usr/bin/snapraid:/usr/bin/snapraid:ro \
  -e SNAPRAID_BIN=/usr/bin/snapraid \
```

### Image tags

| Tag | Content |
|---|---|
| `latest` | Latest release |
| `1.2.3`, `1.2` | Specific release |

## 🛠️ Development

Requires Node.js 22+ and Deno 2.5+.

```bash
git clone https://github.com/firsttris/snapraid-ui
cd snapraid-ui
./install.sh
./start.sh           # uses ./snapraid and the snapraid binary on your PATH
./start.sh --demo    # sandbox with fake disks, no real array or SnapRAID install needed
```

Frontend runs on http://localhost:3000, backend API on http://localhost:8080. `Ctrl+C` stops both.

`--demo` runs `dev/setup.sh`, which builds a pinned SnapRAID into `dev/bin/` (needs `curl`, `gcc`, `make`) and creates `dev/sandbox/` with three data disks, a parity disk and a few pending changes. `dev/setup.sh --reset` starts over.

<details>
<summary>Stopping leftover processes</summary>

```bash
pgrep -af "src/main.ts"                                   # show running backends
pkill -f "deno task dev"; pkill -f "deno run.*src/main.ts"
pkill -f "vite dev"
```

</details>

### Building the image locally

```bash
docker build -f docker/Dockerfile -t snapraid-ui .
```

Pushing a `v*` tag publishes a multi-arch image to Docker Hub via GitHub Actions.

### Stack

- **Backend**: Deno + Hono, WebSocket for live output, file-based storage
- **Frontend**: React 19, TanStack Start/Router/Query, Tailwind CSS, Paraglide i18n
- **Container**: Nginx reverse proxy, Supervisor, bundled SnapRAID

## 🤝 Contributing

Issues and pull requests are welcome. Please run `npx biome check`, `npm run typecheck` and the tests (`deno test` in `backend/`, `npm test` in `frontend/`) before opening a PR.

## 📄 License

MIT

---

<div align="center">
<sub>Not affiliated with the SnapRAID project. SnapRAID is developed by Andrea Mazzoleni.</sub>
</div>

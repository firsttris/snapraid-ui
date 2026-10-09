# Installation

SnapRAID UI runs as a single container that bundles SnapRAID, the web interface and its backend. This page shows how to run it with Docker, Docker Compose or Podman, how to give it access to your disks, and how to put it behind a reverse proxy.

- [Requirements](#requirements)
- [Docker Compose](#docker-compose)
- [Docker run](#docker-run)
- [Podman Quadlet](#podman-quadlet)
- [Disks and paths](#disks-and-paths)
- [Privileged mode and SMART](#privileged-mode-and-smart)
- [First start](#first-start)
- [Reverse proxy and HTTPS](#reverse-proxy-and-https)
- [Updating](#updating)
- [Using your own SnapRAID binary](#using-your-own-snapraid-binary)
- [Building the image yourself](#building-the-image-yourself)
- [Uninstalling](#uninstalling)

## Requirements

- A Linux host with Docker or Podman. The image [`tristanteu/snapraid-ui`](https://hub.docker.com/r/tristanteu/snapraid-ui) is published for **amd64** and **arm64**.
- Your data, parity and content locations mounted on the host (SnapRAID works on mounted file systems, not on raw devices).
- Nothing else. The image ships SnapRAID 14 (currently 14.10, built from the official release), `smartctl` from smartmontools, and everything the UI needs.

> [!IMPORTANT]
> SnapRAID UI reads SnapRAID's structured log (`snapraid --log`), which only exists since **SnapRAID 14.0**. Most distributions still ship 12.x, so use the bundled binary unless you have a 14.x build of your own.

> [!WARNING]
> Don't let two schedulers run SnapRAID on the same array. If cron jobs or scripts on the host (for example `snapraid-runner`) sync or scrub the array, disable them and use the UI's [scheduler](scheduling.md) instead.

## Docker Compose

Create a `docker-compose.yml`:

```yaml
services:
  snapraid-ui:
    image: tristanteu/snapraid-ui:latest
    container_name: snapraid-ui
    restart: unless-stopped
    ports:
      - "3000:80"
    volumes:
      # App data: config.json, snapraid.conf, schedules, logs
      - ./snapraid:/app/snapraid
      # Data, content and parity disks, at the same paths as on the host
      - /mnt/disk1:/mnt/disk1
      - /mnt/disk2:/mnt/disk2
      - /mnt/parity:/mnt/parity
    environment:
      # Login; remove both lines to leave the UI open (e.g. behind your own auth proxy)
      - SNAPRAID_UI_USERNAME=admin
      - SNAPRAID_UI_PASSWORD=change-me
      # Time zone for schedules (the container uses UTC otherwise)
      - TZ=Europe/Berlin
    privileged: true  # Needed for SMART data and the disk power state
```

Start it:

```bash
docker compose up -d
```

Then open `http://<your-server>:3000`. The repository contains the same file as [`docker/docker-compose.yml`](https://github.com/firsttris/snapraid-ui/blob/master/docker/docker-compose.yml), with all optional settings commented out.

## Docker run

The same setup as a single command:

```bash
docker run -d --name snapraid-ui \
  --restart unless-stopped \
  --privileged \
  -p 3000:80 \
  -e SNAPRAID_UI_USERNAME=admin \
  -e SNAPRAID_UI_PASSWORD=change-me \
  -e TZ=Europe/Berlin \
  -v ./snapraid:/app/snapraid \
  -v /mnt/disk1:/mnt/disk1 \
  -v /mnt/disk2:/mnt/disk2 \
  -v /mnt/parity:/mnt/parity \
  tristanteu/snapraid-ui:latest
```

Set `TZ` to your time zone, otherwise schedules run in UTC. All environment variables are listed in [Configuration](configuration.md#environment-variables).

## Podman Quadlet

The repository ships a [Quadlet](https://docs.podman.io/en/latest/markdown/podman-systemd.unit.5.html) unit, [`docker/snapraid-app.container`](https://github.com/firsttris/snapraid-ui/blob/master/docker/snapraid-app.container), and a network, [`docker/snapraid-net.network`](https://github.com/firsttris/snapraid-ui/blob/master/docker/snapraid-net.network), so systemd manages the container.

SMART data needs a privileged container, and that needs **rootful** Podman. For a system-wide install that starts at boot:

```bash
sudo cp docker/snapraid-app.container docker/snapraid-net.network /etc/containers/systemd/
# The password for the login, read by the unit's Secret= line
printf 'your-password' | sudo podman secret create snapraid-ui-password -
# Edit the Volume= lines for your disks (and SNAPRAID_UI_USERNAME if you like)
sudo nano /etc/containers/systemd/snapraid-app.container
sudo systemctl daemon-reload
sudo systemctl start snapraid-app
```

The unit stores the app data in `%h/snapraid`, the home directory of the user running the unit (`/root/snapraid` for a system unit). Create that directory first, or change the `Volume=%h/snapraid:/app/snapraid:Z` line.

For a rootless install, copy the files to `~/.config/containers/systemd/` and use `systemctl --user` and `podman secret` without `sudo`. Rootless Podman cannot read SMART data or the disk power state.

Notes on the unit:

- Add `Environment=TZ=Europe/Berlin` (with your time zone) so schedules run in local time instead of UTC.
- The disk `Volume=` lines have no `:Z`. Relabeling would rewrite the SELinux label of every file on your disks; the unit sets `SecurityLabelDisable=true` instead.
- The password comes from the Podman secret `snapraid-ui-password`. To set it in plain text instead, remove the `Secret=` line and uncomment `Environment=SNAPRAID_UI_PASSWORD=...`.
- To change the password, replace the secret (`podman secret rm snapraid-ui-password`, then create it again) and restart the unit. All existing logins end with the change.
- To run without a login, remove the `SNAPRAID_UI_USERNAME` and `Secret=` lines.

Logs: `journalctl -u snapraid-app` (add `--user` for a rootless unit) or `podman logs snapraid-ui`.

## Disks and paths

SnapRAID UI runs SnapRAID inside the container, so SnapRAID only sees what you mount into it.

**Mount every disk at the same path as on the host.** The paths in your `snapraid.conf` (`data`, `parity`, `content`) must exist inside the container. If the host has `/mnt/disk1`, mount it as `-v /mnt/disk1:/mnt/disk1`, not as `/data/disk1`. This also means the same `snapraid.conf` keeps working with the SnapRAID command line on the host.

Mount everything the config refers to:

| What | Access | Notes |
|---|---|---|
| Data disks | read-write | Read-only works for `sync` and `scrub`, but `fix` (recovering files, replacing a disk) and `touch` write to the data disks, and recovered files get their owner and permissions set. |
| Parity disks | read-write | SnapRAID writes the parity files. |
| Content files | read-write | Every directory with a `content` file must be mounted and persistent. |
| `/app/snapraid` | read-write | The app data directory, see [Configuration](configuration.md#data-directory). |

> [!WARNING]
> A `content` file in a path that is not mounted, such as `/var/snapraid/snapraid.content`, lives inside the container and is lost when the container is recreated. Put content files on your data or parity disks, or in `/app/snapraid` (e.g. `content /app/snapraid/snapraid.content`). SnapRAID recommends one more content file than you have parity levels, each on a different disk.

If a disk is not mounted on the host when the container starts, the container sees its empty mount point instead. SnapRAID notices that all files of the disk are gone and stops the sync; the UI explains these safety stops, see [Using SnapRAID UI](usage.md).

## Privileged mode and SMART

SnapRAID reads SMART data and the power state (`smart`, `probe`, spin down) by calling `smartctl` on the device behind each mount, such as `/dev/sda`. These device nodes only exist in the container when it runs with `--privileged` (`privileged: true` in Compose, `PodmanArgs=--privileged` in the Quadlet unit).

Without it, syncing, scrubbing and all other commands still work. Only the [SMART page](smart.md), disk health warnings and the power state are unavailable.

> [!NOTE]
> A privileged container has broad access to the host. Read [Security](security.md) before exposing the UI beyond your home network.

## Docker socket (optional)

To [pause other containers](automation.md#pause-docker-containers) while SnapRAID syncs or scrubs, SnapRAID UI needs the Docker socket:

```yaml
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
```

With Podman, mount the Podman socket instead, e.g. `/run/podman/podman.sock:/var/run/docker.sock`.

## First start

On the first start, the backend creates `config.json` in the data directory with one configuration named *Default* that points to `snapraid.conf` in the same directory. As long as that file does not exist, the dashboard welcomes you with two options:

- **Add existing configuration.** Copy your `snapraid.conf` into the data directory (`./snapraid/snapraid.conf` in the examples above) and reload the page, nothing else to do. Or add it where it is, under *Manage arrays* → *Add existing file* with an absolute path, as long as the file is reachable inside the container (mount it, for example `-v /etc/snapraid.conf:/etc/snapraid.conf`).
- **Set up a new array.** The [setup wizard](disks.md#set-up-a-new-array) lists the disks mounted into the container, you pick data and parity disks, and it writes the configuration and starts the first sync. Mount the disks first, at the same paths as on the host (see [Disks and paths](#disks-and-paths)).

If your existing config refers to content files outside the mounted paths, mount those directories too, or move the content files as described in [Disks and paths](#disks-and-paths).

## Reverse proxy and HTTPS

Inside the container, Nginx listens on port 80 and serves the interface, the API under `/api` and live updates over a WebSocket under `/ws`. Put your own reverse proxy in front of that port to add HTTPS.

Requirements for the proxy:

- **Forward WebSockets** on `/ws`, otherwise live output and job status don't update.
- **Serve the UI at the root path** of a host name (for example `snapraid.example.com`). The interface requests `/api` and `/ws` as absolute paths, so a sub-path such as `example.com/snapraid/` doesn't work.
- **Publish only the proxy.** Bind the container port to localhost (`127.0.0.1:3000:80`) or reach it over a shared Docker network, so nobody bypasses the proxy.

**Caddy** (WebSockets are forwarded automatically):

```caddyfile
snapraid.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

**Nginx:**

```nginx
server {
    listen 443 ssl;
    server_name snapraid.example.com;
    # ssl_certificate / ssl_certificate_key ...

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

Read [Security](security.md#behind-a-reverse-proxy) for what changes for the login behind a proxy, and how to use an authentication proxy such as Authelia or Authentik instead of the built-in login.

## Updating

Releases are published as image tags:

| Tag | Contents |
|---|---|
| `latest` | The newest release |
| `x.y.z`, `x.y` | A specific release or minor version, e.g. to pin an update |
| `edge` | Built by hand from the development branch, not a release |

Your settings, schedules and logs live in the data directory, so updating only replaces the container.

**Docker Compose:**

```bash
docker compose pull
docker compose up -d
```

**Docker run:** `docker pull tristanteu/snapraid-ui:latest`, then remove the container and run the same `docker run` command again.

**Podman Quadlet:** the unit sets `AutoUpdate=registry`, so `podman auto-update` pulls new releases and restarts the unit. Enable `podman-auto-update.timer` to do this automatically, or run `podman auto-update` by hand.

> [!TIP]
> Avoid updating while a sync or scrub is running. Restarting the container ends the running job; SnapRAID can resume an interrupted sync the next time it runs.

Each image pins a SnapRAID release. When a new SnapRAID version comes out, it is tested against the UI's log parser before the image is bumped, so an update of SnapRAID UI may also update SnapRAID.

## Using your own SnapRAID binary

You can use another SnapRAID binary instead of the bundled one, for example a build with your own patches. Mount it into the container and point `SNAPRAID_BIN` at it:

```yaml
    volumes:
      - /usr/bin/snapraid:/usr/bin/snapraid:ro
    environment:
      - SNAPRAID_BIN=/usr/bin/snapraid
```

The binary must be **SnapRAID 14.0 or newer** and must run inside the container, which is based on Debian. A binary built for a different C library (for example on Alpine) won't start. In most cases the bundled binary is the better choice.

## Building the image yourself

From the repository root:

```bash
docker build -f docker/Dockerfile -t snapraid-ui .
# Pin another SnapRAID release
docker build -f docker/Dockerfile --build-arg SNAPRAID_VERSION=14.10 -t snapraid-ui .
```

Or with Compose, using the `build:` section of the bundled file: `docker compose -f docker/docker-compose.yml up --build`. More in [Development](development.md).

## Uninstalling

1. Stop and remove the container: `docker compose down`, `docker rm -f snapraid-ui`, or for Podman `systemctl stop snapraid-app` and remove the `.container` and `.network` files, then `systemctl daemon-reload`.
2. Optionally remove the image: `docker image rm tristanteu/snapraid-ui`.
3. Optionally delete the data directory (`./snapraid` or `~/snapraid`). Download a [backup](disks.md) first if you might come back.

SnapRAID UI never touches your array on its own when it is removed. Your parity and content files stay on the disks, and you can keep using them with the SnapRAID command line.

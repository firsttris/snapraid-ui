# Documentation

Everything about SnapRAID UI in detail: how to install and configure it, what each page does, how to keep
your array healthy with it, and how it works inside. For a quick overview, see the [README](../README.md).

<img src="screenshot.png" alt="SnapRAID UI dashboard" width="900">

## Getting started

| | |
|---|---|
| [Installation](installation.md) | Requirements, Docker, Docker Compose and Podman, mounting disks, SMART access, reverse proxy and HTTPS, updating, using your own SnapRAID binary |
| [Configuration](configuration.md) | All environment variables, the data directory and its files, log retention |
| [Security](security.md) | Login, sessions and lockout, running behind an auth proxy, exposing the UI safely |

## Using SnapRAID UI

| | |
|---|---|
| [Using SnapRAID UI](usage.md) | The interface, the dashboard, running commands, reports, safety stops, command palette, theme, language and animations |
| [Scheduling](scheduling.md) | Cron schedules, the nightly sync routine, the sync guard, scrub plans |
| [Notifications](notifications.md) | ntfy, e-mail and webhook, which events are sent, testing |
| [SMART & disk health](smart.md) | SMART data, failure probability, warnings and what to do, usage history and fill-up forecast |
| [Logs](logs.md) | The history of every run, filters, overview and raw log, retention |
| [Managing disks](disks.md) | Managing configurations, the config editor, adding, replacing and removing disks, backup and restore |
| [Troubleshooting](troubleshooting.md) | Common problems and how to fix them |

## Behind the scenes

| | |
|---|---|
| [Architecture](architecture.md) | Components, container layout, how jobs run, storage, and the REST and WebSocket API |
| [Development](development.md) | Local setup with the demo sandbox, project structure, tests, translations, building and releasing |

## Screenshots

<img src="screenshots/smart.png" alt="SMART monitoring" width="900">

<img src="screenshots/logs.png" alt="Log history" width="900">

<img src="screenshots/schedules.png" alt="Schedules" width="900">
